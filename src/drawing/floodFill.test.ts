import { describe, expect, it } from "vitest";
import { buildFloodFillOverlay, MAX_FLOOD_FILL_PIXELS } from "./floodFill";

function raster(rows: string[]) {
  const palette: Record<string, [number, number, number]> = {
    W: [255, 255, 255],
    B: [0, 0, 0],
    R: [255, 0, 0],
    G: [242, 242, 242],
  };
  const data = new Uint8ClampedArray(rows.length * rows[0].length * 4);
  rows.forEach((row, y) => [...row].forEach((symbol, x) => {
    const offset = (y * row.length + x) * 4;
    const rgb = palette[symbol];
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
    data[offset + 3] = 255;
  }));
  return { width: rows[0].length, height: rows.length, data };
}

describe("contiguous flood fill", () => {
  it("fills only the connected region, preserving holes in its cropped overlay", () => {
    const result = buildFloodFillOverlay(raster(["WWB", "WBW", "WWB"]), 0, 0, "#ff0000", 0);
    expect(result.filledPixels).toBe(5);
    expect({ x: result.x, y: result.y, width: result.width, height: result.height }).toEqual({ x: 0, y: 0, width: 2, height: 3 });
    expect([...result.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    // The black center pixel is not selected and remains transparent in the overlay.
    expect([...result.data.slice((1 * 2 + 1) * 4, (1 * 2 + 1) * 4 + 4)]).toEqual([0, 0, 0, 0]);
  });

  it("uses the selected tolerance while respecting separated regions", () => {
    const result = buildFloodFillOverlay(raster(["WGB", "BBB"]), 0, 0, "#0000ff", 24);
    expect(result.filledPixels).toBe(2);
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    const strict = buildFloodFillOverlay(raster(["WGB", "BBB"]), 0, 0, "#0000ff", 0);
    expect(strict.filledPixels).toBe(1);
  });

  it("returns an empty result when the sampled pixel already has the requested color", () => {
    const result = buildFloodFillOverlay(raster(["RR", "BB"]), 0, 0, "#ff0000");
    expect(result.filledPixels).toBe(0);
    expect(result.data.length).toBe(0);
  });

  it("rejects invalid dimensions, oversized rasters, seeds, colors, and buffers", () => {
    expect(() => buildFloodFillOverlay({ width: 0, height: 1, data: [] }, 0, 0, "#ff0000")).toThrow(RangeError);
    expect(() => buildFloodFillOverlay({ width: MAX_FLOOD_FILL_PIXELS + 1, height: 1, data: [] }, 0, 0, "#ff0000")).toThrow(RangeError);
    expect(() => buildFloodFillOverlay(raster(["WW"]), 4, 0, "#ff0000")).toThrow(RangeError);
    expect(() => buildFloodFillOverlay(raster(["WW"]), 0, 0, "red")).toThrow(TypeError);
    expect(() => buildFloodFillOverlay({ width: 2, height: 1, data: [255, 255, 255, 255] }, 0, 0, "#ff0000")).toThrow(TypeError);
  });
});
