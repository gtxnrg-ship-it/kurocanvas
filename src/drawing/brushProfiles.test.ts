import { describe, expect, it } from "vitest";
import { getBrushProfile, pressureWidth, type BrushPreset } from "./brushProfiles";

describe("expressive brush profiles", () => {
  it("provides distinct rendering behavior for watercolor, dry brush, and calligraphy", () => {
    expect(getBrushProfile("watercolor").opacity).toBeLessThan(0.25);
    expect(getBrushProfile("watercolor").shadowBlurMultiplier).toBeGreaterThan(0);
    expect(getBrushProfile("dry-brush").dashRatio).toBeGreaterThan(0);
    expect(getBrushProfile("calligraphy").widthMultiplier).toBeGreaterThan(1);
    expect(getBrushProfile("calligraphy").lineCap).toBe("square");
  });

  it("makes pressure-responsive widths with a safe minimum", () => {
    const presets: BrushPreset[] = ["ink", "pencil", "marker", "airbrush", "watercolor", "dry-brush", "calligraphy"];
    for (const preset of presets) {
      expect(pressureWidth(0.9, 8, preset)).toBeGreaterThan(pressureWidth(0.2, 8, preset));
      expect(pressureWidth(0, 8, preset)).toBeGreaterThan(0);
      expect(Number.isFinite(pressureWidth(1, 8, preset))).toBe(true);
    }
  });

  it("falls back to natural mid-pressure for absent pressure values", () => {
    expect(pressureWidth(undefined, 10, "ink")).toBe(pressureWidth(0.5, 10, "ink"));
  });
});
