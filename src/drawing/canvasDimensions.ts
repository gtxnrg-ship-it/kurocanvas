export const CANVAS_PRESETS: Record<string, [number, number]> = {
  landscape: [1600, 1200],
  portrait: [1200, 1800],
  square: [1600, 1600],
  webtoon: [900, 3000],
  "long-webtoon": [900, 6000],
  manga: [1800, 2700],
  a4: [2480, 3508],
};

export function isValidCanvasDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) &&
    width >= 256 && height >= 256 &&
    width <= 6000 && height <= 6000 &&
    width * height <= 16_000_000;
}
