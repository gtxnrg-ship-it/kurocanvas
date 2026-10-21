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
  it("parses valid JSON and rejects malformed JSON", () => {
    expect(parseDrawingPlan(JSON.stringify([validStroke]), bounds)).toHaveLength(1);
    expect(() => parseDrawingPlan("{", bounds)).toThrow(/valid JSON/);
  });
});
