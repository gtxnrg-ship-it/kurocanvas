export interface StrokeGeometryPoint {
  x: number;
  y: number;
}

export interface StrokeGeometryInput {
  points: readonly StrokeGeometryPoint[];
  size: number;
  shape?: string;
  text?: string;
}

export interface StrokeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate a stroke's visible bounds without spreading the point list into a
 * function call. Drawing sessions can produce hundreds of thousands of points;
 * JavaScript engines impose an argument-count limit that Math.min(...points)
 * can exceed, making ordinary selection fail on long, otherwise valid strokes.
 */
export function getStrokeBounds(stroke: StrokeGeometryInput): StrokeBounds {
  const points = stroke.points;
  const pad = Math.max(6, stroke.size);
  if (points.length === 0) {
    return { x: -pad, y: -pad, width: pad * 2 + 1, height: pad * 2 + 1 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const textLines = (stroke.text ?? "").split("\n");
  let textWidth = 0;
  let textHeight = 0;
  if (stroke.shape === "text") {
    textWidth = 12;
    for (const line of textLines) textWidth = Math.max(textWidth, line.length * stroke.size * 0.62);
    textHeight = textLines.length * stroke.size * 1.3;
  }

  const bubbleWidth = stroke.shape === "bubble" ? Math.max(8, (maxX - minX) * 0.12) : 0;
  const bubbleHeight = stroke.shape === "bubble" ? Math.max(8, (maxY - minY) * 0.22) : 0;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX, textWidth) + pad * 2 + bubbleWidth,
    height: Math.max(1, maxY - minY, textHeight) + pad * 2 + bubbleHeight,
  };
}
