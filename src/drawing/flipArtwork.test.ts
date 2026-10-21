import { describe, expect, it } from "vitest";
import { flipStrokeGeometry } from "./flipArtwork";

const stroke = {
  id: "mark-1",
  tool: "brush",
  color: "#171321",
  rotation: 0.25,
  points: [
    { x: 10, y: 20, pressure: 0.4 },
    { x: 30, y: 50, pressure: 0.8 },
    { x: 50, y: 30, pressure: 1 },
  ],
};

describe("selected artwork flip", () => {
  it("mirrors points across the object's horizontal center and preserves pressure", () => {
    const result = flipStrokeGeometry(stroke, "horizontal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stroke.points).toEqual([
      { x: 50, y: 20, pressure: 0.4 },
      { x: 30, y: 50, pressure: 0.8 },
      { x: 10, y: 30, pressure: 1 },
    ]);
    expect(result.stroke.rotation).toBe(-0.25);
    expect(result.stroke.id).toBe("mark-1");
  });

  it("mirrors vertically without moving the object's bounds", () => {
    const result = flipStrokeGeometry(stroke, "vertical");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stroke.points.map(point => point.y)).toEqual([50, 20, 40]);
    expect(Math.min(...result.stroke.points.map(point => point.y))).toBe(20);
    expect(Math.max(...result.stroke.points.map(point => point.y))).toBe(50);
    expect(result.stroke.rotation).toBe(Math.PI - 0.25);
  });

  it.each(["text", "image", "bubble"])("safely refuses %s objects that need content-aware flipping", shape => {
    const result = flipStrokeGeometry({ ...stroke, shape }, "horizontal");
    expect(result.ok).toBe(false);
  });
});
