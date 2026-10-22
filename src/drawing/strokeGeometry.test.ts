import { describe, expect, it } from "vitest";
import { getStrokeBounds } from "./strokeGeometry";

describe("stroke geometry bounds", () => {
  it("preserves the padded bounds for ordinary strokes", () => {
    expect(getStrokeBounds({
      points: [{ x: 10, y: 20 }, { x: 40, y: 60 }],
      size: 2,
    })).toEqual({ x: 4, y: 14, width: 42, height: 52 });
  });

  it("handles long stylus strokes without exceeding the JavaScript argument limit", () => {
    const points = Array.from({ length: 200_000 }, (_, index) => ({
      x: index,
      y: index % 2 ? 10 : -5,
    }));

    expect(getStrokeBounds({ points, size: 2 })).toEqual({
      x: -6,
      y: -11,
      width: 200_011,
      height: 27,
    });
  });

  it("calculates long text bounds without spreading all lines into one call", () => {
    const text = Array.from({ length: 150_000 }, () => "x").join("\n");
    const bounds = getStrokeBounds({
      points: [{ x: 0, y: 0 }],
      size: 10,
      shape: "text",
      text,
    });

    expect(bounds.x).toBe(-10);
    expect(bounds.y).toBe(-10);
    expect(bounds.width).toBe(32);
    expect(bounds.height).toBe(1_950_020);
  });
});
