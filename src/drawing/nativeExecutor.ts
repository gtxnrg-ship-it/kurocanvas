import type { NativeDrawingCommand, AddStrokeCommand } from "./commands";
import type { DrawingLayer } from "./layers";

export interface NativeStroke {
  id: string;
  layerId?: string;
  tool: "brush" | "eraser";
  color: string;
  size: number;
  points: Array<{ x: number; y: number; pressure: number }>;
}

export interface NativeDrawingState {
  width: number;
  height: number;
  strokes: NativeStroke[];
  layers: DrawingLayer[];
}

export interface NativeExecutionResult {
  state: NativeDrawingState;
  inverse: NativeDrawingCommand[];
  changed: boolean;
}

/**
 * Deterministic, side-effect-free state reducer for validated native drawing commands.
 * It does not access the DOM, call a model, or persist state; the UI can apply the
 * returned state and retain the previous snapshot for real undo/checkpoint support.
 */
export function applyNativeDrawingCommand(
  state: NativeDrawingState,
  command: NativeDrawingCommand,
): NativeExecutionResult {
  const layers = state.layers.map(layer => ({ ...layer }));
  const strokes = state.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));

  if (command.type === "stroke.add") {
    const layer = layers.find(item => item.id === command.layerId);
    if (!layer) throw new Error("Cannot execute stroke: target layer does not exist.");
    if (layer.locked) throw new Error("Cannot execute stroke: target layer is locked.");
    const stroke: NativeStroke = {
      id: command.id,
      layerId: command.layerId,
      tool: command.tool,
      color: command.color,
      size: command.size,
      points: command.points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? 0.5 })),
    };
    const inverse: NativeDrawingCommand[] = [{
      version: 1, id: command.id + ":undo", type: "stroke.remove", strokeId: command.id,
    } as NativeDrawingCommand];
    return { state: { ...state, layers, strokes: [...strokes, stroke] }, inverse, changed: true };
  }

  const layer = layers.find(item => item.id === command.layerId);
  if (!layer) throw new Error("Cannot execute layer command: target layer does not exist.");
  if (command.type === "layer.setVisibility") {
    const previous = layer.visible;
    layer.visible = command.visible;
    return {
      state: { ...state, layers, strokes },
      inverse: [{ version: 1, id: command.id + ":undo", type: "layer.setVisibility", layerId: layer.id, visible: previous }],
      changed: previous !== command.visible,
    };
  }
  if (command.type === "layer.setOpacity") {
    const previous = layer.opacity;
    layer.opacity = command.opacity;
    return {
      state: { ...state, layers, strokes },
      inverse: [{ version: 1, id: command.id + ":undo", type: "layer.setOpacity", layerId: layer.id, opacity: previous }],
      changed: previous !== command.opacity,
    };
  }
  if (command.type === "layer.setLock") {
    const previous = layer.locked;
    layer.locked = command.locked;
    return {
      state: { ...state, layers, strokes },
      inverse: [{ version: 1, id: command.id + ":undo", type: "layer.setLock", layerId: layer.id, locked: previous }],
      changed: previous !== command.locked,
    };
  }
  throw new Error("Unsupported native drawing command.");
}

/** Apply a whole plan atomically: if one operation fails, callers retain the original state. */
export function applyNativeDrawingPlan(
  state: NativeDrawingState,
  commands: readonly NativeDrawingCommand[],
): NativeExecutionResult {
  let next = state;
  const inverse: NativeDrawingCommand[] = [];
  let changed = false;
  for (const command of commands) {
    const result = applyNativeDrawingCommand(next, command);
    next = result.state;
    inverse.unshift(...result.inverse);
    changed ||= result.changed;
  }
  return { state: next, inverse, changed };
}
