import { describe, expect, it } from "vitest";
import { parseDrawingPlan, validateDrawingCommand, validateDrawingPlan } from "./commands";

const bounds = { width: 1600, height: 1200, layerIds: ["ink"], lockedLayerIds: [] as string[] };
const validStroke = {
  version: 1, id: "stroke-1", type: "stroke.add", layerId: "ink",
  tool: "brush", color: "#112233", size: 4,
  points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 40, y: 60, pressure: 1 }],
};

describe("drawing command validation", () => {
  it("accepts a valid bounded stroke", () => expect(validateDrawingCommand(validStroke, bounds).valid).toBe(true));
  it("rejects points outside the document", () => expect(validateDrawingCommand({ ...validStroke, points: [{ x: 1601, y: 0 }] }, bounds).valid).toBe(false));
  it("rejects a locked target layer", () => expect(validateDrawingCommand(validStroke, { ...bounds, lockedLayerIds: ["ink"] }).valid).toBe(false));
  it("rejects duplicate command IDs in one plan", () => {
    expect(validateDrawingPlan([validStroke, { ...validStroke }], bounds).errors.some(e => e.includes("Duplicate command ID"))).toBe(true);
  });
  it("rejects removal of unknown strokes and strokes on locked layers", () => {
    const remove = { version: 1, id: "remove-1", type: "stroke.remove", strokeId: "stroke-existing" };
    const documentBounds = { ...bounds, strokeLayerById: { "stroke-existing": "ink" } };
    expect(validateDrawingCommand(remove, documentBounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...remove, strokeId: "missing" }, documentBounds).valid).toBe(false);
    expect(validateDrawingCommand(remove, { ...documentBounds, lockedLayerIds: ["ink"] }).valid).toBe(false);
  });
  it("validates reversible style edits only for existing unlocked strokes", () => {
    const update = { version: 1, id: "edit-1", type: "stroke.update", strokeId: "stroke-existing", patch: { color: "#abcdef", size: 8 } };
    const documentBounds = { ...bounds, strokeLayerById: { "stroke-existing": "ink" } };
    expect(validateDrawingCommand(update, documentBounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...update, strokeId: "missing" }, documentBounds).valid).toBe(false);
    expect(validateDrawingCommand(update, { ...documentBounds, lockedLayerIds: ["ink"] }).valid).toBe(false);
    expect(validateDrawingCommand({ ...update, patch: {} }, documentBounds).valid).toBe(false);
    expect(validateDrawingCommand({ ...update, patch: { points: [{ x: 1, y: 1 }] } }, documentBounds).valid).toBe(false);
  });
  it("validates native transforms only for existing, unlocked strokes", () => {
    const transform = {
      version: 1, id: "transform-1", type: "stroke.transform", strokeId: "stroke-existing",
      translateX: 10, translateY: 15, scaleX: 2, scaleY: 1.5, rotationDegrees: 30,
    };
    const documentBounds = { ...bounds, strokeLayerById: { "stroke-existing": "ink" } };
    expect(validateDrawingCommand(transform, documentBounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...transform, strokeId: "missing" }, documentBounds).valid).toBe(false);
    expect(validateDrawingCommand(transform, { ...documentBounds, lockedLayerIds: ["ink"] }).valid).toBe(false);
    expect(validateDrawingCommand({ ...transform, scaleX: 0 }, documentBounds).valid).toBe(false);
    expect(validateDrawingCommand({ ...transform, rotationDegrees: 999 }, documentBounds).valid).toBe(false);
  });
  it("parses editable shape and lettering metadata", () => {
    const bubble = { ...validStroke, shape: "bubble", fillColor: "#fffdfb", points: [{x:20,y:30},{x:220,y:140}] };
    expect(validateDrawingCommand(bubble, bounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...validStroke, shape: "text" }, bounds).errors.join(" ")).toMatch(/non-empty text/);
    expect(validateDrawingCommand({ ...validStroke, shape: "text", text: "Hello", fontFamily: "comic" }, bounds).valid).toBe(true);
  });
  it("validates safe native layer creation, renaming and reordering", () => {
    const layerBounds = { width: 800, height: 600, layerIds: ["ink", "tone"], lockedLayerIds: [], strokeLayerById: { "stroke-1": "ink" } };
    const addLayer = { version: 1, id: "cmd-create-layer", type: "layer.add", layerId: "detail", name: "Detail ink", index: 1 };
    const rename = { version: 1, id: "cmd-rename-layer", type: "layer.rename", layerId: "tone", name: "Background wash" };
    const reorder = { version: 1, id: "cmd-reorder-layer", type: "layer.reorder", layerId: "tone", index: 0 };
    expect(validateDrawingCommand(addLayer, layerBounds).valid).toBe(true);
    expect(validateDrawingCommand(rename, layerBounds).valid).toBe(true);
    expect(validateDrawingCommand(reorder, layerBounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...addLayer, layerId: "ink" }, layerBounds).valid).toBe(false);
    expect(validateDrawingCommand({ ...addLayer, index: 99 }, layerBounds).valid).toBe(false);
    expect(validateDrawingCommand({ ...rename, name: " " }, layerBounds).valid).toBe(false);
  });

  it("permits removal only for an empty non-final layer and with full stroke context", () => {
    const layerBounds = { width: 800, height: 600, layerIds: ["ink", "tone"], lockedLayerIds: [], strokeLayerById: { "stroke-1": "ink" } };
    const removeEmpty = { version: 1, id: "cmd-remove-layer", type: "layer.remove", layerId: "tone" };
    expect(validateDrawingCommand(removeEmpty, layerBounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...removeEmpty, layerId: "ink" }, layerBounds).valid).toBe(false);
    expect(validateDrawingCommand(removeEmpty, { ...layerBounds, layerIds: ["tone"] }).valid).toBe(false);
    expect(validateDrawingCommand(removeEmpty, { width: 800, height: 600, layerIds: ["ink", "tone"] }).valid).toBe(false);
  });

  it("validates inverse restoration of an empty layer and its position", () => {
    const restore = {
      version: 1, id: "cmd-restore-layer", type: "layer.restore", index: 1,
      layer: { id: "tone", name: "Tone", visible: true, locked: false, opacity: 0.75, blendMode: "multiply" },
    };
    expect(validateDrawingCommand(restore, bounds).valid).toBe(true);
    expect(validateDrawingCommand({ ...restore, layer: { ...restore.layer, id: "ink" } }, bounds).valid).toBe(false);
    expect(validateDrawingCommand({ ...restore, index: 99 }, bounds).valid).toBe(false);
  });

  it("validates plans against the evolving layer and stroke state", () => {
    const documentBounds = { width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [], strokeLayerById: { "existing-stroke": "ink" } };
    const plan = [
      { version: 1, id: "create-layer-command", type: "layer.add", layerId: "detail", name: "Detail", index: 1 },
      { version: 1, id: "new-stroke", type: "stroke.add", layerId: "detail", tool: "brush", color: "#112233", size: 3, points: [{ x: 10, y: 10 }] },
      { version: 1, id: "remove-new-stroke", type: "stroke.remove", strokeId: "new-stroke" },
      { version: 1, id: "remove-detail", type: "layer.remove", layerId: "detail" },
    ];
    expect(validateDrawingPlan(plan, documentBounds).valid).toBe(true);
    const invalid = [plan[0], { ...plan[1], layerId: "missing-layer" }];
    expect(validateDrawingPlan(invalid, documentBounds).valid).toBe(false);
  });

  it("parses valid JSON and rejects malformed JSON", () => {
    expect(parseDrawingPlan(JSON.stringify([validStroke]), bounds)).toHaveLength(1);
    expect(() => parseDrawingPlan("{", bounds)).toThrow(/valid JSON/);
  });
});
