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

  it("rejects out-of-bounds model output", () => {
    expect(() => applyCommandsToLocalDrawing(document, [{ ...stroke, points: [{ x: 99999, y: 1 }] }])).toThrow(/rejected/);
  });
  it("rejects non-array input", () => {
    expect(() => applyCommandsToLocalDrawing(document, { ...stroke })).toThrow(/array/);
  });
});
