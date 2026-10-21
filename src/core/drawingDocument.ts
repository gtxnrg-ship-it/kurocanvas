import { isValidCanvasDimensions } from "../drawing/canvasDimensions";

const MAX_DRAWING_STROKES = 20_000;
const MAX_TOTAL_DRAWING_POINTS = 500_000;
const MAX_STROKE_POINTS = 5_000;
const MAX_IMAGE_DATA_URL_CHARS = 20 * 1024 * 1024;
const SHAPES = ["line", "rectangle", "ellipse", "text", "panel", "bubble", "image"] as const;
const BRUSH_PRESETS = ["ink", "pencil", "marker", "airbrush", "watercolor", "dry-brush", "calligraphy"] as const;
const BLEND_MODES = ["normal", "multiply", "screen", "overlay"] as const;
const FONT_FAMILIES = ["comic", "sans", "serif"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyText(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * Validate local drawing data wherever it crosses a persistence/import boundary.
 * This is deliberately structural (not UI-dependent) so damaged or imported data
 * cannot create impossible canvas dimensions, malformed paths, duplicate identities,
 * or runaway point/image payloads before the renderer sees it.
 */
export function validateLocalDrawingDocument(value: unknown, expectedProjectId?: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["Drawing document must be an object."];
  const doc = value;

  if (!nonEmptyText(doc.id, 160)) errors.push("Drawing ID is missing or invalid.");
  if (doc.projectId !== undefined && !nonEmptyText(doc.projectId, 160)) errors.push("Drawing project ID is invalid.");
  if (expectedProjectId !== undefined && (!expectedProjectId.trim() || doc.projectId !== expectedProjectId)) {
    errors.push("Drawing belongs to a different or missing project.");
  }
  if (doc.version !== 1) errors.push("Unsupported drawing document version.");
  if (!isValidCanvasDimensions(doc.width as number, doc.height as number)) {
    errors.push("Canvas dimensions are outside the supported limits.");
  }
  if (typeof doc.background !== "string" || doc.background.length > 128) {
    errors.push("Canvas background must be a short color value.");
  }
  if (doc.updatedAt !== undefined && (typeof doc.updatedAt !== "string" || doc.updatedAt.length > 100)) {
    errors.push("Drawing update timestamp is invalid.");
  }

  const layers = doc.layers;
  const layerIds = new Set<string>();
  if (layers !== undefined) {
    if (!Array.isArray(layers) || layers.length > 200) {
      errors.push("Drawing layers must be a list of at most 200 entries.");
    } else {
      for (const layer of layers) {
        if (!isRecord(layer) || !nonEmptyText(layer.id, 160) || !nonEmptyText(layer.name, 256)
          || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") {
          errors.push("Drawing contains an invalid layer.");
          continue;
        }
        if (layerIds.has(layer.id)) errors.push("Drawing contains duplicate layer IDs.");
        layerIds.add(layer.id);
        if (layer.opacity !== undefined && (typeof layer.opacity !== "number" || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) {
          errors.push("Layer opacity must be between 0 and 1.");
        }
        if (layer.blendMode !== undefined && !BLEND_MODES.includes(layer.blendMode as typeof BLEND_MODES[number])) {
          errors.push("Drawing layer uses an unsupported blend mode.");
        }
      }
    }
  }

  if (!Array.isArray(doc.strokes)) {
    errors.push("Drawing strokes must be a list.");
    return errors;
  }
  if (doc.strokes.length > MAX_DRAWING_STROKES) errors.push("Drawing exceeds the supported stroke limit.");
  const strokeIds = new Set<string>();
  let totalPoints = 0;

  for (const stroke of doc.strokes) {
    if (!isRecord(stroke)) {
      errors.push("Drawing contains an invalid stroke.");
      continue;
    }
    if (!nonEmptyText(stroke.id, 160)) errors.push("Stroke ID is missing or invalid.");
    else {
      if (strokeIds.has(stroke.id)) errors.push("Drawing contains duplicate stroke IDs.");
      strokeIds.add(stroke.id);
    }
    if (stroke.layerId !== undefined && !nonEmptyText(stroke.layerId, 160)) errors.push("Stroke layer ID is invalid.");
    else if (typeof stroke.layerId === "string" && layers !== undefined && Array.isArray(layers) && layerIds.size && !layerIds.has(stroke.layerId)) {
      errors.push("Stroke references a layer that does not exist in this document.");
    }
    if (stroke.tool !== "brush" && stroke.tool !== "eraser") errors.push("Stroke uses an unsupported tool.");
    if (!validHexColor(stroke.color)) errors.push("Stroke color must be a six-digit hex value.");
    if (typeof stroke.size !== "number" || !Number.isFinite(stroke.size) || stroke.size <= 0 || stroke.size > 256) {
      errors.push("Stroke size is outside the supported range.");
    }
    if (stroke.shape !== undefined && !SHAPES.includes(stroke.shape as typeof SHAPES[number])) errors.push("Stroke uses an unsupported shape.");
    if (stroke.text !== undefined && (typeof stroke.text !== "string" || stroke.text.length > 5000)) errors.push("Stroke text is invalid or too long.");
    if (stroke.shape === "text" && (typeof stroke.text !== "string" || !stroke.text.trim())) errors.push("Text strokes need non-empty text.");
    if (stroke.fontFamily !== undefined && !FONT_FAMILIES.includes(stroke.fontFamily as typeof FONT_FAMILIES[number])) errors.push("Stroke uses an unsupported font family.");
    if (stroke.filled !== undefined && typeof stroke.filled !== "boolean") errors.push("Stroke fill flag must be a boolean.");
    if (stroke.fillColor !== undefined && !validHexColor(stroke.fillColor)) errors.push("Stroke fill color must be a six-digit hex value.");
    if (stroke.rotation !== undefined && (typeof stroke.rotation !== "number" || !Number.isFinite(stroke.rotation) || stroke.rotation < -360 || stroke.rotation > 360)) {
      errors.push("Stroke rotation is outside the supported range.");
    }
    if (stroke.brushPreset !== undefined && !BRUSH_PRESETS.includes(stroke.brushPreset as typeof BRUSH_PRESETS[number])) {
      errors.push("Stroke uses an unsupported brush preset.");
    }
    if (stroke.imageDataUrl !== undefined && (typeof stroke.imageDataUrl !== "string"
      || stroke.imageDataUrl.length > MAX_IMAGE_DATA_URL_CHARS
      || !/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);/i.test(stroke.imageDataUrl))) {
      errors.push("Embedded image data is invalid or exceeds the supported size.");
    }
    if (stroke.shape === "image" && typeof stroke.imageDataUrl !== "string") errors.push("Image strokes need embedded image data.");
    if (stroke.imageName !== undefined && (typeof stroke.imageName !== "string" || stroke.imageName.length > 512)) errors.push("Embedded image name is invalid.");

    if (!Array.isArray(stroke.points) || stroke.points.length < 1 || stroke.points.length > MAX_STROKE_POINTS) {
      errors.push("Stroke must contain between 1 and " + MAX_STROKE_POINTS + " points.");
      continue;
    }
    totalPoints += stroke.points.length;
    for (const point of stroke.points) {
      if (!isRecord(point) || typeof point.x !== "number" || !Number.isFinite(point.x)
        || typeof point.y !== "number" || !Number.isFinite(point.y)
        || point.x < 0 || point.y < 0
        || typeof doc.width !== "number" || typeof doc.height !== "number"
        || point.x > doc.width || point.y > doc.height
        || (point.pressure !== undefined && (typeof point.pressure !== "number" || !Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1))) {
        errors.push("Stroke contains invalid coordinates or pressure.");
        break;
      }
    }
  }
  if (totalPoints > MAX_TOTAL_DRAWING_POINTS) errors.push("Drawing exceeds the supported total point limit.");
  return [...new Set(errors)];
}
