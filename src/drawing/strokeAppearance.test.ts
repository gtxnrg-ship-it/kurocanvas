import { describe, expect, it } from "vitest";
import { applyStrokeAppearance, normalizeOpacity } from "./strokeAppearance";

const strokes = [
  { id: "a", color: "#111111", opacity: 1, size: 8, points: [{ x: 1, y: 2 }] },
  { id: "b", color: "#ffffff", size: 4, points: [{ x: 9, y: 7 }] },
];

describe("selected stroke appearance", () => {
  it("changes only the selected object's color and opacity", () => {
    const result = applyStrokeAppearance(strokes, "a", { color: "#ff80aa", opacity: 0.35 });
    expect(result[0]).toMatchObject({ color: "#ff80aa", opacity: 0.35, size: 8 });
    expect(result[0].points).toEqual(strokes[0].points);
    expect(result[1]).toEqual(strokes[1]);
  });

  it("clamps opacity to a valid range", () => {
    expect(normalizeOpacity(-5)).toBe(0);
    expect(normalizeOpacity(4)).toBe(1);
    expect(normalizeOpacity(0.45)).toBe(0.45);
    expect(normalizeOpacity(Number.NaN)).toBe(1);
  });

  it("rejects invalid color strings without changing the array", () => {
    expect(applyStrokeAppearance(strokes, "a", { color: "not a color" })).toBe(strokes);
  });

  it("leaves unknown selected IDs unchanged", () => {
    expect(applyStrokeAppearance(strokes, "missing", { opacity: 0.5 })).toEqual(strokes);
  });
});
