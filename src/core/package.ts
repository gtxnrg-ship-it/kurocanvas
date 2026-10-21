import { validateProject, type KuroProject } from "./project";
import { createZipArchive, readZipArchive } from "./zipArchive";

export const KURO_PACKAGE_EXTENSION = ".kuro.json";
export const KURO_PACKAGE_FORMAT = "kuro-canvas-package";
export const KURO_PACKAGE_VERSION = 1;
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

export interface KuroPackage {
  format: typeof KURO_PACKAGE_FORMAT;
  packageVersion: typeof KURO_PACKAGE_VERSION;
  exportedAt: string;
  project: KuroProject;
  assets: Record<string, string>;
}

export function createKuroPackage(project: KuroProject, assets: Record<string, string> = {}): KuroPackage {
  if (!validateProject(project)) throw new Error("Cannot package an invalid Kuro project.");
  for (const [key, value] of Object.entries(assets)) {
    if (!key.trim() || typeof value !== "string") throw new Error("Package assets must use non-empty keys and string data.");
  }
  return {
    format: KURO_PACKAGE_FORMAT,
    packageVersion: KURO_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    assets,
  };
}

export function serializeKuroPackage(pkg: KuroPackage): string {
  validateKuroPackage(pkg);
  const json = JSON.stringify(pkg);
  if (new TextEncoder().encode(json).byteLength > MAX_PACKAGE_BYTES) {
    throw new Error("Package exceeds the 50 MB safety limit. Export assets separately for now.");
  }
  return json;
}

export function parseKuroPackage(text: string): KuroPackage {
  if (new TextEncoder().encode(text).byteLength > MAX_PACKAGE_BYTES) {
    throw new Error("Package exceeds the 50 MB safety limit.");
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("This file is not valid Kuro package JSON."); }
  validateKuroPackage(value);
  return value;
}

export function validateKuroPackage(value: unknown): asserts value is KuroPackage {
  if (!value || typeof value !== "object") throw new Error("Invalid Kuro package.");
  const pkg = value as Partial<KuroPackage>;
  if (pkg.format !== KURO_PACKAGE_FORMAT || pkg.packageVersion !== KURO_PACKAGE_VERSION) {
    throw new Error("Unsupported Kuro package format or version.");
  }
  if (!validateProject(pkg.project)) throw new Error("Package contains an invalid Kuro project.");
  if (!pkg.assets || typeof pkg.assets !== "object" || Array.isArray(pkg.assets)) {
    throw new Error("Package assets must be a key-value object.");
  }
  for (const [key, asset] of Object.entries(pkg.assets)) {
    if (!key.trim() || typeof asset !== "string") throw new Error("Package contains an invalid asset entry.");
  }
}

export function downloadKuroPackage(project: KuroProject, assets: Record<string, string> = {}): void {
  const content = serializeKuroPackage(createKuroPackage(project, assets));
  const blob = new Blob([content], { type: "application/vnd.kuro-canvas+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = project.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") + KURO_PACKAGE_EXTENSION;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const KURO_ARCHIVE_EXTENSION = ".kuro";
const ARCHIVE_MANIFEST = "manifest.json";

/** Package into a portable ZIP with a manifest and independently checksummed asset files. */
export function serializeKuroArchive(pkg: KuroPackage): Uint8Array {
  validateKuroPackage(pkg);
  const assetFiles: Record<string, string> = {};
  const entries = Object.entries(pkg.assets).sort(([a], [b]) => a.localeCompare(b)).map(([key, value], index) => {
    const path = "assets/" + String(index).padStart(5, "0") + ".utf8";
    assetFiles[key] = path;
    return { name: path, data: new TextEncoder().encode(value) };
  });
  const manifest = {
    format: pkg.format,
    packageVersion: pkg.packageVersion,
    exportedAt: pkg.exportedAt,
    project: pkg.project,
    assetFiles,
  };
  entries.unshift({ name: ARCHIVE_MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest)) });
  return createZipArchive(entries);
}

/** Import native ZIP archives and legacy JSON packages, preserving existing JSON backups. */
export function parseKuroArchive(bytes: Uint8Array): KuroPackage {
  const entries = readZipArchive(bytes);
  const byName = new Map(entries.map(entry => [entry.name, entry.data]));
  const manifestBytes = byName.get(ARCHIVE_MANIFEST);
  if (!manifestBytes) throw new Error("This Kuro archive is missing its manifest.");
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)); }
  catch { throw new Error("The Kuro archive manifest is not valid JSON."); }
  if (!raw || typeof raw !== "object") throw new Error("The Kuro archive manifest is invalid.");
  const manifest = raw as { format?: unknown; packageVersion?: unknown; exportedAt?: unknown; project?: unknown; assetFiles?: unknown };
  if (!manifest.assetFiles || typeof manifest.assetFiles !== "object" || Array.isArray(manifest.assetFiles)) {
    throw new Error("The Kuro archive manifest has no valid asset index.");
  }
  const assetFiles = manifest.assetFiles as Record<string, unknown>;
  const assets: Record<string, string> = {};
  const expectedPaths = new Set([ARCHIVE_MANIFEST]);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const [key, path] of Object.entries(assetFiles)) {
    if (!key.trim() || typeof path !== "string" || !path.startsWith("assets/") || expectedPaths.has(path)) {
      throw new Error("The Kuro archive contains an invalid asset index entry.");
    }
    const data = byName.get(path);
    if (!data) throw new Error("The Kuro archive is missing asset: " + key);
    try { assets[key] = decoder.decode(data); }
    catch { throw new Error("The Kuro archive asset is not valid UTF-8 text: " + key); }
    expectedPaths.add(path);
  }
  if (entries.some(entry => !expectedPaths.has(entry.name))) throw new Error("The Kuro archive contains unreferenced files.");
  const pkg = {
    format: manifest.format,
    packageVersion: manifest.packageVersion,
    exportedAt: manifest.exportedAt,
    project: manifest.project,
    assets,
  };
  validateKuroPackage(pkg);
  return pkg;
}
