export interface StrokeAppearance {
  id: string;
  color: string;
  opacity?: number;
}

export interface AppearanceChange {
  color?: string;
  opacity?: number;
}

export function normalizeOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function applyStrokeAppearance<T extends StrokeAppearance>(
  strokes: T[],
  id: string,
  change: AppearanceChange,
): T[] {
  const color = change.color;
  const validColor = color === undefined || /^#[0-9a-f]{6}$/i.test(color);
  if (!validColor) return strokes;
  const opacity = change.opacity === undefined ? undefined : normalizeOpacity(change.opacity);
  return strokes.map(stroke => stroke.id !== id ? stroke : {
    ...stroke,
    ...(color === undefined ? {} : { color }),
    ...(opacity === undefined ? {} : { opacity }),
  });
}
