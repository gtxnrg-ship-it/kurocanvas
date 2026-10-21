import { describe, expect, it } from "vitest";
import { applyCommandsToLocalDrawing } from "./localDrawingBridge";
import type { LocalDrawingDocument } from "../core/storage";

const document: LocalDrawingDocument = {
  id: "doc-1", name: "Sketch", version: 1, width: 1600, height: 1200,
  background: "#ffffff", updatedAt: "2026-01-01T00:00:00.000Z",
  layers: [{ id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" }],
  strokes: [],
};
const stroke = {
  version: 1, id: "ai-stroke-1", type: "stroke.add", layerId: "ink",
  tool: "brush", color: "#112233", size: 5, points: [{ x: 10, y: 20, pressure: 0.8 }],
};

describe("local drawing command bridge", () => {
  it("converts a validated command plan into a document snapshot", () => {
    const result = applyCommandsToLocalDrawing(document, [stroke]);
    expect(result.changed).toBe(true);
    expect(result.document.strokes).toHaveLength(1);
    expect(result.document.strokes[0].id).toBe("ai-stroke-1");
    expect(document.strokes).toHaveLength(0);
  });
  it("rejects unknown layers before producing a new snapshot", () => {
    expect(() => applyCommandsToLocalDrawing(document, [{ ...stroke, layerId: "missing" }])).toThrow(/unknown layer/);
    expect(document.strokes).toHaveLength(0);
  });
  it("resolves the planner default layer to the first visible unlocked custom layer", () => {
    const customDocument: LocalDrawingDocument = {
      ...document,
      layers: [
        { id: "hidden", name: "Hidden", visible: false, locked: false, opacity: 1, blendMode: "normal" },
        { id: "locked", name: "Locked", visible: true, locked: true, opacity: 1, blendMode: "normal" },
        { id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" },
      ],
    };
    const result = applyCommandsToLocalDrawing(customDocument, [{ ...stroke, layerId: "layer-default" }]);
    expect(result.document.strokes[0].layerId).toBe("ink");
  });

  it("does not redirect a default-layer plan when no visible unlocked target exists", () => {
    const customDocument: LocalDrawingDocument = {
      ...document,
      layers: [
        { id: "hidden", name: "Hidden", visible: false, locked: false, opacity: 1, blendMode: "normal" },
        { id: "locked", name: "Locked", visible: true, locked: true, opacity: 1, blendMode: "normal" },
      ],
    };
    expect(() => applyCommandsToLocalDrawing(customDocument, [{ ...stroke, layerId: "layer-default" }]))
      .toThrow(/visible, unlocked layer/i);
  });

  it("persists editable shape and text metadata without rasterizing", () => {
    const result = applyCommandsToLocalDrawing(document, [
      { ...stroke, id: "panel-1", shape: "panel", filled: false, points: [{x:20,y:20},{x:800,y:600}] },
      { ...stroke, id: "lettering-1", shape: "text", text: "A new beginning", fontFamily: "comic", points: [{x:80,y:90}] },
    ]);
    expect(result.document.strokes[0].shape).toBe("panel");
    expect(result.document.strokes[1].shape).toBe("text");
    expect(result.document.strokes[1].text).toBe("A new beginning");
    expect(result.document.strokes[1].fontFamily).toBe("comic");
  });
  it("preserves stroke opacity and brush presets through plan serialization", () => {
    const result = applyCommandsToLocalDrawing(document, [
      { ...stroke, id: "low-opacity", opacity: 0.35, brushPreset: "pencil" },
    ]);
    expect(result.document.strokes[0].opacity).toBe(0.35);
    expect(result.document.strokes[0].brushPreset).toBe("pencil");
  });

  it("persists native shape rotation using the canvas renderer's radian convention", () => {
    const result = applyCommandsToLocalDrawing(document, [{
      ...stroke, id: "rotated-panel", shape: "rectangle", rotation: 90,
      points: [{ x: 100, y: 100 }, { x: 200, y: 150 }],
    }]);
    expect(result.document.strokes[0].rotation).toBeCloseTo(Math.PI / 2);
  });

  it("creates a layer, draws on it, renames it, and reverses the complete sequence", () => {
    const plan = [
      { version: 1, id: "create-details", type: "layer.add", layerId: "details", name: "Detail ink", index: 1 },
      { ...stroke, id: "detail-stroke", layerId: "details" },
      { version: 1, id: "rename-details", type: "layer.rename", layerId: "details", name: "Face details" },
    ];
    const result = applyCommandsToLocalDrawing(document, plan);
    expect(result.document.layers?.map(layer => layer.name)).toEqual(["Ink", "Face details"]);
    expect(result.document.strokes[0].layerId).toBe("details");
    expect(result.inverse.map(command => command.type)).toEqual(["layer.rename", "stroke.remove", "layer.remove"]);
    const undone = applyCommandsToLocalDrawing(result.document, result.inverse);
    expect(undone.document.layers?.map(layer => layer.id)).toEqual(["ink"]);
    expect(undone.document.strokes).toEqual([]);
  });

  it("reorders layers in document order and refuses to delete a non-empty layer", () => {
    const layered: LocalDrawingDocument = {
      ...document,
      layers: [
        { id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" },
        { id: "tone", name: "Tone", visible: true, locked: false, opacity: 1, blendMode: "normal" },
      ],
    };
    const reordered = applyCommandsToLocalDrawing(layered, [{ version: 1, id: "move-tone", type: "layer.reorder", layerId: "tone", index: 0 }]);
    expect(reordered.document.layers?.map(layer => layer.id)).toEqual(["tone", "ink"]);
    const withStroke = applyCommandsToLocalDrawing(layered, [{ ...stroke, layerId: "tone" }]).document;
    expect(() => applyCommandsToLocalDrawing(withStroke, [{ version: 1, id: "remove-tone", type: "layer.remove", layerId: "tone" }]))
      .toThrow(/contains strokes/i);
  });

  it("rejects out-of-bounds model output", () => {
    expect(() => applyCommandsToLocalDrawing(document, [{ ...stroke, points: [{ x: 99999, y: 1 }] }])).toThrow(/rejected/);
  });
  it("rejects non-array input", () => {
    expect(() => applyCommandsToLocalDrawing(document, { ...stroke })).toThrow(/array/);
  });
});
