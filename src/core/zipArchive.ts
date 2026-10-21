const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 2000;

export interface ArchiveEntry { name: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safeName(name: string): boolean {
  return !!name && name.length <= 1024 && !name.startsWith("/") && !name.includes("\\") &&
    !name.includes("\0") && name.split("/").every(part => !!part && part !== ".." && part !== ".");
}

/** Create a standards-compliant ZIP archive using STORE (no compression) entries. */
export function createZipArchive(entries: readonly ArchiveEntry[]): Uint8Array {
  if (!entries.length || entries.length > MAX_ENTRIES) throw new Error("Archive entry count is outside the supported range.");
  const names = new Set<string>();
  let estimatedSize = 22;
  for (const entry of entries) {
    if (!entry || !(entry.data instanceof Uint8Array) || !safeName(entry.name) || names.has(entry.name)) throw new Error("Archive contains an unsafe, duplicate, or invalid path.");
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    const data = entry.data;
    if (!name.length || name.length > 65535 || data.byteLength > 0xffffffff) throw new Error("Archive entry is too large.");
    estimatedSize += 30 + name.length + data.length + 46 + name.length;
    if (estimatedSize > MAX_ARCHIVE_BYTES) throw new Error("Archive exceeds the 50 MB safety limit.");
  }
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30); local.set(data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    central.set(name, 46); centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  const total = offset + centralSize + end.length;
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of locals) { result.set(part, cursor); cursor += part.length; }
  for (const part of centrals) { result.set(part, cursor); cursor += part.length; }
  result.set(end, cursor);
  return result;
}

/** Read safe, uncompressed ZIP entries. Reject unsupported compression and malformed bounds. */
export function readZipArchive(bytes: Uint8Array): ArchiveEntry[] {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("Archive exceeds the 50 MB safety limit.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  let endOffset = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { endOffset = i; break; }
  }
  if (endOffset < 0) throw new Error("This file is not a valid ZIP archive.");
  const count = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (count > MAX_ENTRIES || centralOffset + centralSize > endOffset) throw new Error("ZIP directory is invalid or exceeds supported limits.");
  const entries: ArchiveEntry[] = [];
  const seen = new Set<string>();
  let cursor = centralOffset;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ZIP directory entry is damaged.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length) throw new Error("ZIP entry metadata is out of bounds.");
    if ((flags & 1) !== 0 || method !== 0 || compressed !== uncompressed) throw new Error("Encrypted or compressed ZIP entries are not supported by this importer yet.");
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("ZIP local entry is damaged.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + uncompressed;
    if (dataStart < 0 || dataEnd > centralOffset || dataEnd > bytes.length) throw new Error("ZIP entry data is out of bounds.");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!safeName(name) || seen.has(name)) throw new Error("ZIP contains an unsafe or duplicate path.");
    seen.add(name);
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new Error("ZIP entry checksum failed: " + name);
    entries.push({ name, data });
    cursor = next;
  }
  return entries;
}
