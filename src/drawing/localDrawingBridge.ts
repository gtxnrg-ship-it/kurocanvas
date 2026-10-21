import type { LocalDrawingDocument } from "../core/storage";
import { parseDrawingPlan, type NativeDrawingCommand } from "./commands";
import { applyNativeDrawingPlan, type NativeDrawingState } from "./nativeExecutor";
import type { DrawingLayer } from "./layers";

export interface AppliedLocalDrawingPlan {
  document: LocalDrawingDocument;
  inverse: NativeDrawingCommand[];
  changed: boolean;
}

/**
 * Validates an untrusted command plan against a local drawing and applies it to
 * an immutable snapshot. Callers should replace their live document only after
 * this function succeeds, then persist that snapshot before reporting success.
 */
export function applyCommandsToLocalDrawing(
  document: LocalDrawingDocument,
  untrustedCommands: unknown,
): AppliedLocalDrawingPlan {
  const layers: DrawingLayer[] = document.layers?.length
    ? document.layers.map((layer, index) => ({
        id: layer.id,
        name: layer.name,
        order: index,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity ?? 1,
        blendMode: layer.blendMode ?? "normal",
      }))
    : [{ id: "layer-default", name: "Sketch", order: 0, visible: true, locked: false, opacity: 1, blendMode: "normal" }];

  const normalizedDocument: LocalDrawingDocument = {
    ...document,
    layers: layers.map(layer => ({ ...layer })),
    strokes: document.strokes.map(stroke => ({
      ...stroke,
      layerId: stroke.layerId || layers[0].id,
      points: stroke.points.map(point => ({ ...point })),
    })),
  };

  if (!Array.isArray(untrustedCommands)) {
    throw new Error("Drawing commands must be supplied as an array.");
  }

  // "layer-default" is the planner's stable target alias. Older/imported
  // documents may have custom layer IDs, so resolve the alias only when the
  // literal default layer does not exist. Never redirect a locked explicit
  // target; the normal validator will reject it.
  let inputCommands: unknown[] = untrustedCommands;
  if (!layers.some(layer => layer.id === "layer-default") &&
      untrustedCommands.some(command => command && typeof command === "object" &&
        (command as { layerId?: unknown }).layerId === "layer-default")) {
    const target = layers.find(layer => layer.visible && !layer.locked);
    if (!target) {
      throw new Error("Kuro could not find a visible, unlocked layer for the proposed drawing. Unlock or show a layer and try again.");
    }
    inputCommands = untrustedCommands.map(command => {
      if (!command || typeof command !== "object") return command;
      const value = command as Record<string, unknown>;
      if (value.type === "stroke.add" && value.layerId === "layer-default") {
        return { ...value, layerId: target.id };
      }
      if (value.type === "stroke.restore" && value.stroke && typeof value.stroke === "object" &&
          (value.stroke as { layerId?: unknown }).layerId === "layer-default") {
        return { ...value, stroke: { ...(value.stroke as Record<string, unknown>), layerId: target.id } };
      }
      return command;
    });
  }

  const commands = parseDrawingPlan(JSON.stringify(inputCommands), {
    width: document.width,
    height: document.height,
    layerIds: layers.map(layer => layer.id),
    lockedLayerIds: layers.filter(layer => layer.locked).map(layer => layer.id),
    strokeLayerById: Object.fromEntries(normalizedDocument.strokes.map(stroke => [stroke.id, stroke.layerId || layers[0].id])),
  });

  const state: NativeDrawingState = {
    width: document.width,
    height: document.height,
    layers,
    strokes: normalizedDocument.strokes.map(stroke => ({
      ...stroke,
      layerId: stroke.layerId || layers[0].id,
      points: stroke.points.map(point => ({ ...point, pressure: point.pressure ?? 0.5 })),
    })),
  };
  const result = applyNativeDrawingPlan(state, commands);
  return {
    document: {
      ...normalizedDocument,
      layers: result.state.layers.map(layer => ({
        id: layer.id, name: layer.name, visible: layer.visible, locked: layer.locked,
        opacity: layer.opacity, blendMode: layer.blendMode,
      })),
      strokes: result.state.strokes.map(stroke => ({
        id: stroke.id, layerId: stroke.layerId, tool: stroke.tool, color: stroke.color,
        size: stroke.size, points: stroke.points.map(point => ({ ...point })),
        ...(stroke.shape ? { shape: stroke.shape } : {}),
        ...(stroke.imageDataUrl ? { imageDataUrl: stroke.imageDataUrl } : {}),
        ...(stroke.imageName ? { imageName: stroke.imageName } : {}),
        ...(stroke.text !== undefined ? { text: stroke.text } : {}),
        ...(stroke.fontFamily ? { fontFamily: stroke.fontFamily } : {}),
        ...(stroke.filled !== undefined ? { filled: stroke.filled } : {}),
        ...(stroke.fillColor ? { fillColor: stroke.fillColor } : {}),
        ...(stroke.rotation !== undefined ? { rotation: stroke.rotation } : {}),
        ...(stroke.brushPreset ? { brushPreset: stroke.brushPreset } : {}),
      })),
      updatedAt: new Date().toISOString(),
    },
    inverse: result.inverse,
    changed: result.changed,
  };
}
