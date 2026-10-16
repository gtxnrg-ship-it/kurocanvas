import { validateProject, type KuroProject } from "./project";

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
