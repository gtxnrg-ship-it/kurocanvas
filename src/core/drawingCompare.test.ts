import { describe, expect, it } from "vitest";
import { sameDrawingContent } from "./drawingCompare";
import type { LocalDrawingDocument } from "./storage";

function makeDrawing(overrides: Partial<LocalDrawingDocument> = {}): LocalDrawingDocument {
  return {
    id: "drawing-a",
    projectId: "project-a",
    name: "Scene 1",
    version: 1,
    width: 800,
    height: 600,
    background: "#fffdfb",
    layers: [{ id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" }],
    strokes: [{
      id: "stroke-a",
      layerId: "ink",
      tool: "brush",
      color: "#112233",
      size: 4,
      points: [{ x: 10, y: 15, pressure: 0.5 }],
    }],
    updatedAt: "2026-10-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("drawing content comparison for atomic saves", () => {
  it("ignores save timestamps and object-key insertion order", () => {
    const original = makeDrawing();
    const second = makeDrawing({
      updatedAt: "2026-10-21T00:03:00.000Z",
      strokes: [{
        points: [{ pressure: 0.5, y: 15, x: 10 }],
        size: 4, color: "#112233", tool: "brush", layerId: "ink", id: "stroke-a",
      }],
    });
    expect(sameDrawingContent(original, second)).toBe(true);
  });

  it("normalizes legacy layer defaults without ignoring visible/locked changes", () => {
    const legacy = makeDrawing({ layers: [{ id: "ink", name: "Ink", visible: true, locked: false }] });
    expect(sameDrawingContent(legacy, makeDrawing())).toBe(true);
    expect(sameDrawingContent(legacy, makeDrawing({
      layers: [{ id: "ink", name: "Ink", visible: false, locked: false }],
    }))).toBe(false);
    expect(sameDrawingContent(legacy, makeDrawing({
      layers: [{ id: "ink", name: "Ink", visible: true, locked: true }],
    }))).toBe(false);
  });

  it("detects edits to ownership, dimensions, naming and strokes", () => {
    const original = makeDrawing();
    expect(sameDrawingContent(original, makeDrawing({ projectId: "project-b" }))).toBe(false);
    expect(sameDrawingContent(original, makeDrawing({ width: 1200 }))).toBe(false);
    expect(sameDrawingContent(original, makeDrawing({ name: "New name" }))).toBe(false);
    expect(sameDrawingContent(original, makeDrawing({
      strokes: [{ ...original.strokes[0], points: [{ x: 11, y: 15, pressure: 0.5 }] }],
    }))).toBe(false);
  });

  it("compares large reference image data without recreating the payload", () => {
    const image = "data:image/png;base64," + "x".repeat(300_000);
    const left = makeDrawing({ strokes: [{ ...makeDrawing().strokes[0], shape: "image", imageDataUrl: image }] });
    const same = makeDrawing({ strokes: [{ ...left.strokes[0], imageDataUrl: image }] });
    const changed = makeDrawing({ strokes: [{ ...left.strokes[0], imageDataUrl: image.slice(0, 100_000) + "y" + image.slice(100_001) }] });
    expect(sameDrawingContent(left, same)).toBe(true);
    expect(sameDrawingContent(left, changed)).toBe(false);
  });

  it("distinguishes absent records from saved blank documents", () => {
    expect(sameDrawingContent(undefined, undefined)).toBe(true);
    expect(sameDrawingContent(undefined, makeDrawing({ strokes: [] }))).toBe(false);
    expect(sameDrawingContent(makeDrawing(), undefined)).toBe(false);
  });
});
