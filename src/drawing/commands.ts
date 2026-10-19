/**
 * Versioned, JSON-safe commands for native canvas automation.
 * This module validates untrusted model output; it never evaluates code.
 */
export const DRAWING_COMMAND_VERSION = 1 as const;
export const MAX_COMMANDS_PER_PLAN = 200;
export const MAX_POINTS_PER_STROKE = 5000;
export const MAX_STROKE_SIZE = 256;

export interface DrawingPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface AddStrokeCommand {
  version: typeof DRAWING_COMMAND_VERSION;
  id: string;
  type: "stroke.add";
  layerId: string;
  tool: "brush" | "eraser";
  color: string;
  size: number;
  points: DrawingPoint[];
}

export interface RemoveStrokeCommand {
  version: typeof DRAWING_COMMAND_VERSION;
  id: string;
  type: "stroke.remove";
  strokeId: string;
}

/** Internal reversible command used by undo; restores the exact stroke ID and stack position. */
export interface RestoreStrokeCommand {
  version: typeof DRAWING_COMMAND_VERSION;
  id: string;
  type: "stroke.restore";
  stroke: {
    id: string;
    layerId: string;
    tool: "brush" | "eraser";
    color: string;
    size: number;
    points: DrawingPoint[];
  };
  index: number;
}

export interface SetLayerVisibilityCommand {
  version: typeof DRAWING_COMMAND_VERSION;
  id: string;
  type: "layer.setVisibility";
  layerId: string;
  visible: boolean;
}

export interface SetLayerOpacityCommand {
  version: typeof DRAWING_COMMAND_VERSION;
  id: string;
  type: "layer.setOpacity";
  layerId: string;
  opacity: number;
}

export interface SetLayerLockCommand {
  version: typeof DRAWING_COMMAND_VERSION;
  id: string;
  type: "layer.setLock";
  layerId: string;
  locked: boolean;
}

export type NativeDrawingCommand =
  | AddStrokeCommand
  | RemoveStrokeCommand
  | RestoreStrokeCommand
  | SetLayerVisibilityCommand
  | SetLayerOpacityCommand
  | SetLayerLockCommand;

export interface DrawingDocumentBounds {
  width: number;
  height: number;
  layerIds: readonly string[];
  lockedLayerIds?: readonly string[];
}

export interface CommandValidationResult {
  valid: boolean;
  errors: string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPoint(value: unknown, bounds: DrawingDocumentBounds): value is DrawingPoint {
  if (!record(value) || !finite(value.x) || !finite(value.y)) return false;
  if (value.x < 0 || value.y < 0 || value.x > bounds.width || value.y > bounds.height) return false;
  if (value.pressure !== undefined && (!finite(value.pressure) || value.pressure < 0 || value.pressure > 1)) return false;
  return true;
}

export function validateDrawingCommand(
  value: unknown,
  bounds: DrawingDocumentBounds,
): CommandValidationResult {
  const errors: string[] = [];
  if (!record(value)) return { valid: false, errors: ["Command must be an object."] };
  if (value.version !== DRAWING_COMMAND_VERSION) errors.push("Unsupported drawing command version.");
  if (!nonEmptyString(value.id, 160)) errors.push("Command ID is missing or too long.");
  if (!nonEmptyString(value.type, 80)) return { valid: false, errors: [...errors, "Command type is missing."] };

  switch (value.type) {
    case "stroke.add": {
      if (!nonEmptyString(value.layerId) || !bounds.layerIds.includes(String(value.layerId))) errors.push("Stroke targets an unknown layer.");
      if (typeof value.layerId === "string" && (bounds.lockedLayerIds ?? []).includes(value.layerId)) errors.push("Stroke targets a locked layer.");
      if (value.tool !== "brush" && value.tool !== "eraser") errors.push("Unsupported stroke tool.");
      if (typeof value.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.color)) errors.push("Stroke color must be a six-digit hex color.");
      if (!finite(value.size) || value.size <= 0 || value.size > MAX_STROKE_SIZE) errors.push("Stroke size is outside the supported range.");
      if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > MAX_POINTS_PER_STROKE) {
        errors.push("Stroke must contain between 1 and " + MAX_POINTS_PER_STROKE + " points.");
      } else if (!value.points.every(point => validPoint(point, bounds))) {
        errors.push("Stroke contains an invalid point or a point outside the document bounds.");
      }
      break;
    }
    case "stroke.remove":
      if (!nonEmptyString(value.strokeId, 160)) errors.push("Stroke ID is missing or too long.");
      break;
    case "stroke.restore": {
      if (!record(value.stroke)) {
        errors.push("Restored stroke must be an object.");
        break;
      }
      const stroke = value.stroke;
      if (!nonEmptyString(stroke.id, 160)) errors.push("Restored stroke ID is missing or too long.");
      if (!nonEmptyString(stroke.layerId) || !bounds.layerIds.includes(String(stroke.layerId))) errors.push("Restored stroke targets an unknown layer.");
      if (typeof stroke.layerId === "string" && (bounds.lockedLayerIds ?? []).includes(stroke.layerId)) errors.push("Restored stroke targets a locked layer.");
      if (stroke.tool !== "brush" && stroke.tool !== "eraser") errors.push("Unsupported restored stroke tool.");
      if (typeof stroke.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(stroke.color)) errors.push("Restored stroke color must be a six-digit hex color.");
      if (!finite(stroke.size) || stroke.size <= 0 || stroke.size > MAX_STROKE_SIZE) errors.push("Restored stroke size is outside the supported range.");
      if (!Array.isArray(stroke.points) || stroke.points.length < 1 || stroke.points.length > MAX_POINTS_PER_STROKE) {
        errors.push("Restored stroke must contain between 1 and " + MAX_POINTS_PER_STROKE + " points.");
      } else if (!stroke.points.every(point => validPoint(point, bounds))) {
        errors.push("Restored stroke contains an invalid point or a point outside the document bounds.");
      }
      if (!Number.isInteger(value.index) || (value.index as number) < 0 || (value.index as number) > 10000000) errors.push("Restored stroke index is invalid.");
      break;
    }
    case "layer.setVisibility":
      if (!nonEmptyString(value.layerId) || !bounds.layerIds.includes(String(value.layerId))) errors.push("Visibility command targets an unknown layer.");
      if (typeof value.visible !== "boolean") errors.push("Visibility must be a boolean.");
      break;
    case "layer.setOpacity":
      if (!nonEmptyString(value.layerId) || !bounds.layerIds.includes(String(value.layerId))) errors.push("Opacity command targets an unknown layer.");
      if (!finite(value.opacity) || value.opacity < 0 || value.opacity > 1) errors.push("Layer opacity must be between 0 and 1.");
      break;
    case "layer.setLock":
      if (!nonEmptyString(value.layerId) || !bounds.layerIds.includes(String(value.layerId))) errors.push("Lock command targets an unknown layer.");
      if (typeof value.locked !== "boolean") errors.push("Lock state must be a boolean.");
      break;
    default:
      errors.push("Unknown drawing command type: " + value.type);
  }
  return { valid: errors.length === 0, errors };
}

export function validateDrawingPlan(
  value: unknown,
  bounds: DrawingDocumentBounds,
): CommandValidationResult {
  if (!Array.isArray(value)) return { valid: false, errors: ["Drawing plan must be an array of commands."] };
  if (value.length > MAX_COMMANDS_PER_PLAN) {
    return { valid: false, errors: ["Plan exceeds the limit of " + MAX_COMMANDS_PER_PLAN + " commands."] };
  }
  const errors: string[] = [];
  const ids = new Set<string>();
  value.forEach((command, index) => {
    const result = validateDrawingCommand(command, bounds);
    for (const error of result.errors) errors.push("Command " + (index + 1) + ": " + error);
    if (record(command) && typeof command.id === "string") {
      if (ids.has(command.id)) errors.push("Duplicate command ID: " + command.id);
      ids.add(command.id);
    }
  });
  return { valid: errors.length === 0, errors };
}

/** Strictly parse JSON and validate the result before any executor sees it. */
export function parseDrawingPlan(
  raw: string,
  bounds: DrawingDocumentBounds,
): NativeDrawingCommand[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The model did not return valid JSON for the drawing plan.");
  }
  const validation = validateDrawingPlan(parsed, bounds);
  if (!validation.valid) throw new Error("Drawing plan rejected: " + validation.errors.join(" "));
  return parsed as NativeDrawingCommand[];
}
