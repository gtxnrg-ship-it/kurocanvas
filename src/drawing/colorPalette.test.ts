import { describe, expect, it } from "vitest";
import { addPaletteColor, MAX_CUSTOM_SWATCHES, normalizePalette, removePaletteColor } from "./colorPalette";

describe("custom color palette", () => {
  it("normalizes valid hex colors, deduplicates, and ignores invalid values", () => {
    expect(normalizePalette(["#ABCDEF", "#abcdef", "red", null, "#112233"])).toEqual(["#abcdef", "#112233"]);
  });

  it("adds colors without duplicating existing swatches", () => {
    expect(addPaletteColor(["#abcdef"], "#ABCDEF")).toMatchObject({ added: false, reason: "duplicate", colors: ["#abcdef"] });
    expect(addPaletteColor([], "#12ABEF")).toMatchObject({ added: true, colors: ["#12abef"] });
  });

  it("enforces the swatch limit and validates candidates", () => {
    const full = Array.from({ length: MAX_CUSTOM_SWATCHES }, (_, index) => "#" + index.toString(16).padStart(6, "0"));
    expect(addPaletteColor(full, "#ffffff")).toMatchObject({ added: false, reason: "full" });
    expect(addPaletteColor([], "transparent")).toMatchObject({ added: false, reason: "invalid" });
  });

  it("removes only the requested swatch", () => {
    expect(removePaletteColor(["#abcdef", "#123456"], "#ABCDEF")).toEqual(["#123456"]);
  });
});
