import { describe, expect, it } from "vitest";
import { createZipArchive, readZipArchive } from "./zipArchive";

describe("native ZIP archive", () => {
  it("round-trips multiple UTF-8 files", () => {
    const original = [
      { name: "manifest.json", data: new TextEncoder().encode('{"name":"Kuro"}') },
      { name: "kuro/notes.txt", data: new TextEncoder().encode("雨の街 — chapter 4") },
    ];
    const restored = readZipArchive(createZipArchive(original));
    expect(restored.map(item => item.name)).toEqual(original.map(item => item.name));
    expect(restored.map(item => new TextDecoder().decode(item.data))).toEqual(original.map(item => new TextDecoder().decode(item.data)));
  });

  it("rejects duplicate and unsafe paths", () => {
    const entry = { name: "manifest.json", data: new Uint8Array([1]) };
    expect(() => createZipArchive([entry, entry])).toThrow(/unsafe or duplicate/i);
    expect(() => createZipArchive([{ name: "../outside.txt", data: new Uint8Array() }])).toThrow(/unsafe or duplicate/i);
  });

  it("rejects corrupted entry data by checksum", () => {
    const archive = createZipArchive([{ name: "manifest.json", data: new Uint8Array([1, 2, 3]) }]);
    const localNameLength = new DataView(archive.buffer).getUint16(26, true);
    archive[30 + localNameLength] ^= 0xff;
    expect(() => readZipArchive(archive)).toThrow(/checksum/i);
  });
});
