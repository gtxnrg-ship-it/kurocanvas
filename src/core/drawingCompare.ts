import type { LocalDrawingDocument } from "./storage";

function equalDrawingValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => equalDrawingValue(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).filter(key => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter(key => right[key] !== undefined).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => equalDrawingValue(left[key], right[key]));
}

/**
 * Compare all persisted canvas content while ignoring updatedAt. The image data URLs
 * are compared directly, not serialized into a second large string. Missing legacy
 * layer opacity/blend fields are normalized to their editor defaults.
 */
export function sameDrawingContent(left: LocalDrawingDocument | undefined, right: LocalDrawingDocument | undefined): boolean {
  if (!left || !right) return left === right;
  const normalized = (document: LocalDrawingDocument) => ({
    id: document.id,
    projectId: document.projectId ?? "",
    name: document.name ?? "",
    version: document.version,
    width: document.width,
    height: document.height,
    background: document.background,
    layers: (document.layers?.length ? document.layers : [{
      id: "layer-default",
      name: "Sketch",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal" as const,
    }]).map(layer => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity ?? 1,
      blendMode: layer.blendMode ?? "normal",
    })),
    strokes: document.strokes,
  });
  return equalDrawingValue(normalized(left), normalized(right));
}
