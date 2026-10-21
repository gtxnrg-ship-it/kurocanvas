export type SymmetryMode = "off" | "vertical" | "horizontal" | "quad";

export interface SymmetryPoint {
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface SymmetryStroke<P extends SymmetryPoint = SymmetryPoint> {
  id: string;
  points: P[];
  rotation?: number;
  shape?: string;
  tool?: string;
  [key: string]: unknown;
}

/**
 * Expands a new mark into mirrored copies around the document center.
 * Text, speech bubbles, and reference images are deliberately excluded because
 * mirroring those assets makes their content unreadable or misleading.
 */
export function createSymmetryCopies<T extends SymmetryStroke>(
  stroke: T,
  width: number,
  height: number,
  mode: SymmetryMode,
  createId: () => string,
): T[] {
  if (mode === "off" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [stroke];
  if (["text", "bubble", "image"].includes(stroke.shape ?? "")) return [stroke];

  const transforms: Array<(point: T["points"][number]) => T["points"][number]> = [];
  if (mode === "vertical" || mode === "quad") {
    transforms.push(point => ({ ...point, x: width - point.x }));
  }
  if (mode === "horizontal" || mode === "quad") {
    transforms.push(point => ({ ...point, y: height - point.y }));
  }
  if (mode === "quad") {
    transforms.push(point => ({ ...point, x: width - point.x, y: height - point.y }));
  }

  const copies = transforms.map(transform => ({
    ...stroke,
    id: createId(),
    points: stroke.points.map(transform),
    ...(stroke.rotation !== undefined
      ? { rotation: mode === "quad" ? stroke.rotation : -stroke.rotation }
      : {}),
  } as T));
  return [stroke, ...copies];
}
