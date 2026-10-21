import { describe, expect, it } from "vitest";
import { createSymmetryCopies } from "./symmetry";

const mark = {
  id: "original",
  tool: "brush",
  shape: undefined,
  rotation: 0.25,
  points: [{ x: 20, y: 30, pressure: 0.7 }, { x: 40, y: 50, pressure: 0.8 }],
};

describe("canvas symmetry", () => {
  it("returns the original stroke when symmetry is off", () => {
    expect(createSymmetryCopies(mark, 100, 100, "off", () => "copy")).toEqual([mark]);
  });

  it("mirrors across the vertical center while preserving pressure and metadata", () => {
    const result = createSymmetryCopies(mark, 100, 100, "vertical", () => "mirrored");
    expect(result).toHaveLength(2);
    expect(result[1].points).toEqual([{ x: 80, y: 30, pressure: 0.7 }, { x: 60, y: 50, pressure: 0.8 }]);
    expect(result[1].id).toBe("mirrored");
    expect(result[1].rotation).toBe(-0.25);
    expect(result[1].tool).toBe("brush");
  });

  it("creates three mirrored copies for four-way symmetry", () => {
    const result = createSymmetryCopies(mark, 100, 80, "quad", () => "copy");
    expect(result).toHaveLength(4);
    expect(result[1].points[0]).toMatchObject({ x: 80, y: 30 });
    expect(result[2].points[0]).toMatchObject({ x: 20, y: 50 });
    expect(result[3].points[0]).toMatchObject({ x: 80, y: 50 });
    expect(result[3].rotation).toBe(0.25);
  });

  it.each(["text", "bubble", "image"])("does not mirror %s content", shape => {
    const content = { ...mark, shape };
    expect(createSymmetryCopies(content, 100, 100, "quad", () => "copy")).toEqual([content]);
  });

  it("rejects invalid canvas dimensions without altering the stroke", () => {
    expect(createSymmetryCopies(mark, 0, 100, "quad", () => "copy")).toEqual([mark]);
  });
});
