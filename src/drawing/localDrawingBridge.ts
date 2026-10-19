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

  const commands = Array.isArray(untrustedCommands)
    ? parseDrawingPlan(JSON.stringify(untrustedCommands), {
        width: document.width,
        height: document.height,
        layerIds: layers.map(layer => layer.id),
        lockedLayerIds: layers.filter(layer => layer.locked).map(layer => layer.id),
      })
    : (() => { throw new Error("Drawing commands must be supplied as an array."); })();

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
      })),
      updatedAt: new Date().toISOString(),
    },
    inverse: result.inverse,
    changed: result.changed,
  };
}
