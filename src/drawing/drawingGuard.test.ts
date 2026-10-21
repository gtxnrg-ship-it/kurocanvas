import { describe, expect, it } from "vitest";
import { drawingGuardSignature } from "./drawingGuard";

const base = {
  id: "drawing-a", projectId: "project-a", width: 800, height: 600, background: "#fffdfb",
  layers: [{ id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" }],
  strokes: [{ id: "s1", layerId: "ink", tool: "brush", color: "#112233", size: 4, points: [{ x: 1, y: 2, pressure: 0.5 }] }],
};

describe("drawing guard signature", () => {
  it("is stable across object key order and default layer settings", () => {
    const reordered = {
      ...base,
      strokes: [{ size: 4, color: "#112233", tool: "brush", id: "s1", layerId: "ink", points: [{ pressure: 0.5, y: 2, x: 1 }] }],
    };
    expect(drawingGuardSignature(base)).toBe(drawingGuardSignature(reordered));
    expect(drawingGuardSignature({ ...base, layers: [{ id: "ink", name: "Ink", visible: true, locked: false }] }))
      .toBe(drawingGuardSignature(base));
  });

  it("changes when ownership, geometry, or locked/visible layer state changes", () => {
    const original = drawingGuardSignature(base);
    expect(drawingGuardSignature({ ...base, projectId: "project-b" })).not.toBe(original);
    expect(drawingGuardSignature({ ...base, strokes: [{ ...base.strokes[0], points: [{ x: 3, y: 2 }] }] })).not.toBe(original);
    expect(drawingGuardSignature({ ...base, layers: [{ ...base.layers[0], locked: true }] })).not.toBe(original);
    expect(drawingGuardSignature({ ...base, layers: [{ ...base.layers[0], visible: false }] })).not.toBe(original);
  });

  it("returns a bounded signature for large image data", () => {
    const image = "data:image/png;base64," + "x".repeat(400_000);
    const result = drawingGuardSignature({ ...base, strokes: [{ ...base.strokes[0], shape: "image", imageDataUrl: image }] });
    expect(result.length).toBeLessThan(2000);
    expect(result).not.toContain(image);
  });
});
