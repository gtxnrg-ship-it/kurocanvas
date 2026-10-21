import { describe, expect, it } from "vitest";
import { validateLocalDrawingDocument } from "./drawingDocument";

const drawing = (overrides: Record<string, unknown> = {}) => ({
  id: "drawing-1", projectId: "project-a", version: 1, width: 1600, height: 1200,
  background: "#ffffff", updatedAt: "2026-01-01T00:00:00.000Z", layers: [
    { id: "layer-1", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" },
  ],
  strokes: [{
    id: "stroke-1", layerId: "layer-1", tool: "brush", color: "#101010", size: 4,
    points: [{ x: 10, y: 20, pressure: 0.5 }],
  }],
  ...overrides,
});

describe("local drawing document validation", () => {
  it("accepts a valid editable drawing and scoped ownership", () => {
    expect(validateLocalDrawingDocument(drawing(), "project-a")).toEqual([]);
  });

  it.each([
    [{ width: 0 }, /Canvas dimensions/],
    [{ width: 7000, height: 7000 }, /Canvas dimensions/],
    [{ strokes: [{ id: "bad", layerId: "layer-1", tool: "brush", color: "red", size: 4, points: [{ x: -1, y: 4 }] }] }, /six-digit hex|invalid coordinates/],
    [{ strokes: [{ id: "same", color: "#101010", tool: "brush", size: 4, points: [{ x: 1, y: 1 }] }, { id: "same", color: "#101010", tool: "brush", size: 4, points: [{ x: 2, y: 2 }] }] }, /duplicate stroke IDs/],
    [{ layers: [{ id: "layer-1", name: "Ink", visible: true, locked: false }, { id: "layer-1", name: "Again", visible: true, locked: false }] }, /duplicate layer IDs/],
    [{ strokes: [{ id: "broken", layerId: "missing", tool: "brush", color: "#101010", size: 4, points: [{ x: 1, y: 1 }] }] }, /layer that does not exist/],
  ])("rejects malformed or unsafe drawing state", (overrides, expected) => {
    expect(validateLocalDrawingDocument(drawing(overrides), "project-a").join(" ")).toMatch(expected);
  });

  it("rejects cross-project and missing project ownership when a project is required", () => {
    expect(validateLocalDrawingDocument(drawing({ projectId: "project-b" }), "project-a").join(" ")).toMatch(/different or missing project/);
    expect(validateLocalDrawingDocument(drawing({ projectId: undefined }), "project-a").join(" ")).toMatch(/different or missing project/);
  });

  it("keeps legacy documents without layers and optional pressure compatible", () => {
    expect(validateLocalDrawingDocument(drawing({
      layers: undefined,
      strokes: [{ id: "legacy", tool: "brush", color: "#101010", size: 3, points: [{ x: 1, y: 2 }] }],
    }))).toEqual([]);
  });
});
