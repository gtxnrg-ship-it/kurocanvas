import { describe, expect, it } from "vitest";
import { resolveBrushPressure } from "./brushDynamics";

describe("brush pressure response", () => {
  it("keeps width constant when sensitivity is zero", () => {
    expect(resolveBrushPressure(0, 0)).toBe(0.5);
    expect(resolveBrushPressure(0.3, 0)).toBe(0.5);
    expect(resolveBrushPressure(1, 0)).toBe(0.5);
  });
  it("preserves pressure at full sensitivity while keeping a usable light-touch floor", () => {
    expect(resolveBrushPressure(0.8, 100)).toBe(0.8);
    expect(resolveBrushPressure(0, 100)).toBe(0.08);
  });
  it("blends toward neutral pressure at intermediate settings", () => {
    expect(resolveBrushPressure(1, 50)).toBe(0.75);
    expect(resolveBrushPressure(0, 50)).toBe(0.25);
  });
  it("clamps invalid ranges safely", () => {
    expect(resolveBrushPressure(1, 200)).toBe(1);
    expect(resolveBrushPressure(0.7, -10)).toBe(0.5);
    expect(resolveBrushPressure(Number.NaN, 100)).toBe(0.5);
  });
});
