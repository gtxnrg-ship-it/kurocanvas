import { describe, expect, it } from "vitest";
import { CANVAS_PRESETS, isValidCanvasDimensions } from "./canvasDimensions";

describe("canvas dimensions", () => {
  it("provides standard illustration, manga, and Webtoon sizes", () => {
    expect(CANVAS_PRESETS.landscape).toEqual([1600, 1200]);
    expect(CANVAS_PRESETS.square[0]).toBe(CANVAS_PRESETS.square[1]);
    expect(CANVAS_PRESETS.webtoon[1]).toBeGreaterThan(CANVAS_PRESETS.webtoon[0] * 3);
    expect(isValidCanvasDimensions(...CANVAS_PRESETS.a4)).toBe(true);
  });

  it("accepts custom dimensions inside the pixel and side limits", () => {
    expect(isValidCanvasDimensions(1000, 1800)).toBe(true);
    expect(isValidCanvasDimensions(6000, 2000)).toBe(true);
  });

  it.each([
    [255, 1200], [1600, 6001], [6001, 6001], [5000, 4000],
    [1600.5, 1200], [Number.NaN, 1200], [1600, Number.POSITIVE_INFINITY],
  ])("rejects unsafe dimensions %s × %s", (width, height) => {
    expect(isValidCanvasDimensions(width, height)).toBe(false);
  });
});
