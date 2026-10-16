/**
 * Layer primitives for the Kuro Canvas drawing engine.
 *
 * This module deliberately contains no UI or browser APIs so the same layer
 * rules can be used by the canvas, project importer, and future .kuro reader.
 * Existing v1 drawings remain valid; migration is explicit and non-destructive.
 */

export type DrawingLayerId = string;

export interface DrawingLayer {
  id: DrawingLayerId;
  name: string;
  /** Stack order: lower values render first; larger values render above. */
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: "normal" | "multiply" | "screen" | "overlay";
}

export interface LayeredStroke {
  id: string;
  layerId: DrawingLayerId;
}

export interface LayeredDrawingDocument<TStroke extends LayeredStroke = LayeredStroke> {
  version: 2;
  width: number;
  height: number;
  background: string;
  layers: DrawingLayer[];
  strokes: TStroke[];
}

export function createDrawingLayer(name = "Layer 1", order = 0): DrawingLayer {
  return {
    id: createId(),
    name: name.trim() || "Untitled layer",
    order,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function sortLayers(layers: readonly DrawingLayer[]): DrawingLayer[] {
  return [...layers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function validateLayers(layers: unknown): layers is DrawingLayer[] {
  if (!Array.isArray(layers) || layers.length === 0) return false;
  const ids = new Set<string>();
  for (const value of layers) {
    if (!value || typeof value !== "object") return false;
    const layer = value as Partial<DrawingLayer>;
    if (typeof layer.id !== "string" || !layer.id.trim() || ids.has(layer.id)) return false;
    if (typeof layer.name !== "string" || !layer.name.trim()) return false;
    if (!Number.isFinite(layer.order) || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") return false;
    if (!Number.isFinite(layer.opacity) || (layer.opacity as number) < 0 || (layer.opacity as number) > 1) return false;
    if (!["normal", "multiply", "screen", "overlay"].includes(layer.blendMode ?? "")) return false;
    ids.add(layer.id);
  }
  return true;
}

/** Upgrade a v1 flat-stroke drawing in memory without changing the stored source. */
export function migrateFlatDrawing<TStroke extends { id: string }>(document: {
  version: 1;
  width: number;
  height: number;
  background: string;
  strokes: TStroke[];
}): LayeredDrawingDocument<TStroke & LayeredStroke> {
  const layer = createDrawingLayer("Layer 1", 0);
  return {
    version: 2,
    width: document.width,
    height: document.height,
    background: document.background,
    layers: [layer],
    strokes: document.strokes.map(stroke => ({ ...stroke, layerId: layer.id })),
  };
}

/** Reject dangling stroke references instead of silently losing artwork. */
export function validateLayerReferences(
  layers: readonly DrawingLayer[],
  strokes: readonly LayeredStroke[],
): boolean {
  if (!validateLayers(layers)) return false;
  const ids = new Set(layers.map(layer => layer.id));
  return strokes.every(stroke => typeof stroke.layerId === "string" && ids.has(stroke.layerId));
}
