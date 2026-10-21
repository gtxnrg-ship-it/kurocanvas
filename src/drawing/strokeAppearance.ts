export interface StrokeAppearance {
  id: string;
  color: string;
  opacity?: number;
  size?: number;
  filled?: boolean;
  fillColor?: string;
}
export interface AppearanceChange {
  color?: string;
  opacity?: number;
  size?: number;
  filled?: boolean;
  fillColor?: string;
}
export function normalizeOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
export function normalizeStrokeSize(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(512, Math.max(0.25, value));
}
export function applyStrokeAppearance<T extends StrokeAppearance>(strokes: T[], id: string, change: AppearanceChange): T[] {
  const color = change.color;
  const fillColor = change.fillColor;
  const validColor = (value: string | undefined) => value === undefined || /^#[0-9a-f]{6}$/i.test(value);
  if (!validColor(color) || !validColor(fillColor)) return strokes;
  const opacity = change.opacity === undefined ? undefined : normalizeOpacity(change.opacity);
  const size = change.size === undefined ? undefined : normalizeStrokeSize(change.size);
  return strokes.map(stroke => stroke.id !== id ? stroke : {
    ...stroke,
    ...(color === undefined ? {} : { color }),
    ...(fillColor === undefined ? {} : { fillColor }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(size === undefined ? {} : { size }),
    ...(change.filled === undefined ? {} : { filled: change.filled }),
  });
}
