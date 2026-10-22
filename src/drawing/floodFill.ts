export const MAX_FLOOD_FILL_PIXELS = 4_000_000;

export interface RgbaRaster {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface FloodFillOverlay {
  /** Document-space rectangle occupied by the generated transparent overlay. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Cropped RGBA pixels. All pixels outside the selected region are transparent. */
  data: Uint8ClampedArray;
  filledPixels: number;
}

/**
 * Build a transparent RGBA overlay for a contiguous four-way flood fill.
 *
 * The source raster should already be composited in document coordinates, including
 * the visible canvas paper and visible layers. A separate overlay keeps the document
 * editable and lets the caller place the fill on the currently selected layer.
 */
export function buildFloodFillOverlay(
  source: RgbaRaster,
  seedX: number,
  seedY: number,
  fillColor: string,
  tolerance = 24,
): FloodFillOverlay {
  const { width, height, data } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Flood fill needs positive integer raster dimensions.");
  }
  const pixelCount = width * height;
  if (pixelCount > MAX_FLOOD_FILL_PIXELS) {
    throw new RangeError("This canvas is too large for a safe flood fill on this device.");
  }
  if (!data || data.length !== pixelCount * 4) {
    throw new TypeError("Flood fill source pixels do not match the raster dimensions.");
  }
  const x = Math.floor(seedX);
  const y = Math.floor(seedY);
  if (!Number.isFinite(seedX) || !Number.isFinite(seedY) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new RangeError("Flood fill start point is outside the canvas.");
  }
  if (!/^#[0-9a-f]{6}$/i.test(fillColor)) {
    throw new TypeError("Flood fill color must be a six-digit hex color.");
  }

  const fillR = Number.parseInt(fillColor.slice(1, 3), 16);
  const fillG = Number.parseInt(fillColor.slice(3, 5), 16);
  const fillB = Number.parseInt(fillColor.slice(5, 7), 16);
  const seedOffset = (y * width + x) * 4;
  const targetR = data[seedOffset];
  const targetG = data[seedOffset + 1];
  const targetB = data[seedOffset + 2];

  if (targetR === fillR && targetG === fillG && targetB === fillB) {
    return { x, y, width: 0, height: 0, data: new Uint8ClampedArray(0), filledPixels: 0 };
  }

  const allowedTolerance = Number.isFinite(tolerance) ? Math.max(0, Math.min(128, tolerance)) : 24;
  const allowedDistance = allowedTolerance * allowedTolerance * 3;
  const matches = (pixelIndex: number): boolean => {
    const offset = pixelIndex * 4;
    const dr = data[offset] - targetR;
    const dg = data[offset + 1] - targetG;
    const db = data[offset + 2] - targetB;
    return dr * dr + dg * dg + db * db <= allowedDistance;
  };

  // Mark at enqueue time so a pixel is placed on the stack at most once.
  const visited = new Uint8Array(pixelCount);
  const stack = new Uint32Array(pixelCount);
  const fullOverlay = new Uint8ClampedArray(pixelCount * 4);
  let stackSize = 0;
  let filledPixels = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const seedIndex = y * width + x;
  visited[seedIndex] = 1;
  stack[stackSize++] = seedIndex;

  while (stackSize > 0) {
    const pixelIndex = stack[--stackSize];
    if (!matches(pixelIndex)) continue;

    const px = pixelIndex % width;
    const py = Math.floor(pixelIndex / width);
    const offset = pixelIndex * 4;
    fullOverlay[offset] = fillR;
    fullOverlay[offset + 1] = fillG;
    fullOverlay[offset + 2] = fillB;
    fullOverlay[offset + 3] = 255;
    filledPixels++;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);

    const pushIfUnvisited = (neighbor: number) => {
      if (visited[neighbor]) return;
      visited[neighbor] = 1;
      if (matches(neighbor)) stack[stackSize++] = neighbor;
    };

    if (px > 0) pushIfUnvisited(pixelIndex - 1);
    if (px + 1 < width) pushIfUnvisited(pixelIndex + 1);
    if (py > 0) pushIfUnvisited(pixelIndex - width);
    if (py + 1 < height) pushIfUnvisited(pixelIndex + width);
  }

  if (filledPixels === 0 || maxX < minX || maxY < minY) {
    return { x, y, width: 0, height: 0, data: new Uint8ClampedArray(0), filledPixels: 0 };
  }

  const boundsWidth = maxX - minX + 1;
  const boundsHeight = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(boundsWidth * boundsHeight * 4);
  for (let row = 0; row < boundsHeight; row++) {
    const sourceStart = ((minY + row) * width + minX) * 4;
    const sourceEnd = sourceStart + boundsWidth * 4;
    cropped.set(fullOverlay.subarray(sourceStart, sourceEnd), row * boundsWidth * 4);
  }

  return { x: minX, y: minY, width: boundsWidth, height: boundsHeight, data: cropped, filledPixels };
}
