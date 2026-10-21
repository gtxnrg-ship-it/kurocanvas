export type FlipAxis = "horizontal" | "vertical";

export interface EditableArtworkPoint {
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface EditableArtworkStroke<P extends EditableArtworkPoint = EditableArtworkPoint> {
  id: string;
  points: P[];
  shape?: string;
  rotation?: number;
  [key: string]: unknown;
}

export type FlipResult<T> = { ok: true; stroke: T } | { ok: false; reason: string };

/** Reflect editable vector geometry around its own bounds without changing its canvas position. */
export function flipStrokeGeometry<T extends EditableArtworkStroke>(stroke: T, axis: FlipAxis): FlipResult<T> {
  if (stroke.shape === "text" || stroke.shape === "image" || stroke.shape === "bubble") {
    return { ok: false, reason: "Text, image, and speech-balloon objects need content-aware flipping and were left unchanged." };
  }
  if (!stroke.points.length) return { ok: true, stroke };
  const xs = stroke.points.map(point => point.x);
  const ys = stroke.points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const points = stroke.points.map(point => ({
    ...point,
    ...(axis === "horizontal" ? { x: 2 * centerX - point.x } : { y: 2 * centerY - point.y }),
  })) as T["points"];
  const rotation = stroke.rotation === undefined ? undefined
    : axis === "horizontal" ? -stroke.rotation : Math.PI - stroke.rotation;
  return { ok: true, stroke: { ...stroke, points, ...(rotation === undefined ? {} : { rotation }) } };
}
