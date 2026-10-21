import type { NativeDrawingCommand } from "./commands";
import type { DrawingLayer } from "./layers";

export interface NativeStroke {
  id: string;
  layerId?: string;
  tool: "brush" | "eraser";
  color: string;
  size: number;
  points: Array<{ x: number; y: number; pressure: number }>;
  shape?: "line" | "rectangle" | "ellipse" | "text" | "panel" | "bubble" | "image";
  imageDataUrl?: string;
  imageName?: string;
  text?: string;
  fontFamily?: "comic" | "sans" | "serif";
  filled?: boolean;
  fillColor?: string;
  rotation?: number;
  brushPreset?: "ink" | "pencil" | "marker" | "airbrush" | "watercolor" | "dry-brush" | "calligraphy";
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

/** Pure reducer for validated drawing commands; no DOM, network, or model execution. */
export function applyNativeDrawingCommand(
  state: NativeDrawingState,
  command: NativeDrawingCommand,
): NativeExecutionResult {
  const layers = state.layers.map(layer => ({ ...layer }));
  const strokes = state.strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.map(point => ({ ...point })),
  }));

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
      ...(command.shape ? { shape: command.shape } : {}),
      ...(command.text !== undefined ? { text: command.text } : {}),
      ...(command.fontFamily ? { fontFamily: command.fontFamily } : {}),
      ...(command.filled !== undefined ? { filled: command.filled } : {}),
      ...(command.fillColor ? { fillColor: command.fillColor } : {}),
      ...(command.rotation !== undefined ? { rotation: command.rotation } : {}),
      ...(command.brushPreset ? { brushPreset: command.brushPreset } : {}),
    };
    return {
      state: { ...state, layers, strokes: [...strokes, stroke] },
      inverse: [{ version: 1, id: command.id + ":undo", type: "stroke.remove", strokeId: command.id }],
      changed: true,
    };
  }

  if (command.type === "stroke.remove") {
    const index = strokes.findIndex(stroke => stroke.id === command.strokeId);
    if (index < 0) throw new Error("Cannot remove stroke: stroke does not exist.");
    const removed = strokes[index];
    const layer = layers.find(item => item.id === (removed.layerId || layers[0]?.id));
    if (!layer) throw new Error("Cannot remove stroke: its layer does not exist.");
    if (layer.locked) throw new Error("Cannot remove stroke: its layer is locked.");
    strokes.splice(index, 1);
    return {
      state: { ...state, layers, strokes },
      inverse: [{
        version: 1,
        id: command.id + ":undo",
        type: "stroke.restore",
        stroke: {
          id: removed.id,
          layerId: removed.layerId || layers[0]?.id || "",
          tool: removed.tool,
          color: removed.color,
          size: removed.size,
          points: removed.points,
          ...(removed.shape ? { shape: removed.shape } : {}),
          ...(removed.imageDataUrl ? { imageDataUrl: removed.imageDataUrl } : {}),
          ...(removed.imageName ? { imageName: removed.imageName } : {}),
          ...(removed.text !== undefined ? { text: removed.text } : {}),
          ...(removed.fontFamily ? { fontFamily: removed.fontFamily } : {}),
          ...(removed.filled !== undefined ? { filled: removed.filled } : {}),
          ...(removed.fillColor ? { fillColor: removed.fillColor } : {}),
          ...(removed.rotation !== undefined ? { rotation: removed.rotation } : {}),
          ...(removed.brushPreset ? { brushPreset: removed.brushPreset } : {}),
        },
        index,
      }],
      changed: true,
    };
  }

  if (command.type === "stroke.update") {
    const index = strokes.findIndex(stroke => stroke.id === command.strokeId);
    if (index < 0) throw new Error("Cannot update stroke: stroke does not exist.");
    const current = strokes[index];
    const layer = layers.find(item => item.id === (current.layerId || layers[0]?.id));
    if (!layer) throw new Error("Cannot update stroke: its layer does not exist.");
    if (layer.locked) throw new Error("Cannot update stroke: its layer is locked.");
    const previousPatch: { tool?: NativeStroke["tool"]; color?: string; size?: number } = {};
    if (command.patch.tool !== undefined) previousPatch.tool = current.tool;
    if (command.patch.color !== undefined) previousPatch.color = current.color;
    if (command.patch.size !== undefined) previousPatch.size = current.size;
    const updated = { ...current, ...command.patch };
    strokes[index] = updated;
    return {
      state: { ...state, layers, strokes },
      inverse: [{ version: 1, id: command.id + ":undo", type: "stroke.update", strokeId: current.id, patch: previousPatch }],
      changed: (command.patch.tool !== undefined && current.tool !== command.patch.tool) || (command.patch.color !== undefined && current.color !== command.patch.color) || (command.patch.size !== undefined && current.size !== command.patch.size),
    };
  }

  if (command.type === "stroke.transform") {
    const index = strokes.findIndex(stroke => stroke.id === command.strokeId);
    if (index < 0) throw new Error("Cannot transform stroke: stroke does not exist.");
    const current = strokes[index];
    const layer = layers.find(item => item.id === (current.layerId || layers[0]?.id));
    if (!layer) throw new Error("Cannot transform stroke: its layer does not exist.");
    if (layer.locked) throw new Error("Cannot transform stroke: its layer is locked.");
    if (!current.points.length) throw new Error("Cannot transform stroke: it has no geometry.");
    const xs = current.points.map(point => point.x);
    const ys = current.points.map(point => point.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const radians = command.rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(radians), sine = Math.sin(radians);
    const transformed = current.points.map(point => ({
      ...point,
      x: centerX + (point.x - centerX) * command.scaleX + command.translateX,
      y: centerY + (point.y - centerY) * command.scaleY + command.translateY,
    }));
    if (transformed.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < 0 || point.y < 0 || point.x > state.width || point.y > state.height)) {
      throw new Error("Cannot transform stroke: the result would extend beyond the canvas.");
    }
    const newXs = transformed.map(point => point.x);
    const newYs = transformed.map(point => point.y);
    const transformedCenterX = (Math.min(...newXs) + Math.max(...newXs)) / 2;
    const transformedCenterY = (Math.min(...newYs) + Math.max(...newYs)) / 2;
    const effectiveRotation = (current.rotation ?? 0) + radians;
    const effectiveCosine = Math.cos(effectiveRotation), effectiveSine = Math.sin(effectiveRotation);
    const visuallyTransformed = transformed.map(point => {
      const dx = point.x - transformedCenterX, dy = point.y - transformedCenterY;
      return { x: transformedCenterX + dx * effectiveCosine - dy * effectiveSine, y: transformedCenterY + dx * effectiveSine + dy * effectiveCosine };
    });
    if (visuallyTransformed.some(point => point.x < 0 || point.y < 0 || point.x > state.width || point.y > state.height)) {
      throw new Error("Cannot transform stroke: its rotated result would extend beyond the canvas.");
    }
    const updated: NativeStroke = { ...current, points: transformed, rotation: effectiveRotation };
    strokes[index] = updated;
    const original: RestoreStrokeCommand["stroke"] = {
      id: current.id, layerId: current.layerId || layers[0]?.id || "",
      tool: current.tool, color: current.color, size: current.size,
      points: current.points.map(point => ({ ...point })),
      ...(current.shape ? { shape: current.shape } : {}),
      ...(current.imageDataUrl ? { imageDataUrl: current.imageDataUrl } : {}),
      ...(current.imageName ? { imageName: current.imageName } : {}),
      ...(current.text !== undefined ? { text: current.text } : {}),
      ...(current.fontFamily ? { fontFamily: current.fontFamily } : {}),
      ...(current.filled !== undefined ? { filled: current.filled } : {}),
      ...(current.fillColor ? { fillColor: current.fillColor } : {}),
      ...(current.rotation !== undefined ? { rotation: current.rotation } : {}),
      ...(current.brushPreset ? { brushPreset: current.brushPreset } : {}),
    };
    return {
      state: { ...state, layers, strokes },
      inverse: [
        { version: 1, id: command.id + ":undo:remove", type: "stroke.remove", strokeId: current.id },
        { version: 1, id: command.id + ":undo:restore", type: "stroke.restore", stroke: original, index },
      ],
      changed: command.translateX !== 0 || command.translateY !== 0 || command.scaleX !== 1
        || command.scaleY !== 1 || command.rotationDegrees !== 0,
    };
  }

  if (command.type === "stroke.restore") {
    const layer = layers.find(item => item.id === command.stroke.layerId);
    if (!layer) throw new Error("Cannot restore stroke: target layer does not exist.");
    if (layer.locked) throw new Error("Cannot restore stroke: target layer is locked.");
    if (strokes.some(stroke => stroke.id === command.stroke.id)) {
      throw new Error("Cannot restore stroke: a stroke with this ID already exists.");
    }
    const restored: NativeStroke = {
      ...command.stroke,
      points: command.stroke.points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure ?? 0.5 })),
    };
    const index = Math.min(command.index, strokes.length);
    strokes.splice(index, 0, restored);
    return {
      state: { ...state, layers, strokes },
      inverse: [{ version: 1, id: command.id + ":undo", type: "stroke.remove", strokeId: restored.id }],
      changed: true,
    };
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

/** Apply a plan atomically from the caller's perspective: keep the input state unless all commands succeed. */
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
