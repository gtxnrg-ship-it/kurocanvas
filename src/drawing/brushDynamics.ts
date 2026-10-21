/**
 * Blend stylus pressure with a neutral half-pressure baseline.
 * Zero sensitivity yields a constant-width brush; 100 preserves raw input.
 */
export function resolveBrushPressure(pressure: number, sensitivity: number): number {
  const raw = Number.isFinite(pressure) ? Math.min(1, Math.max(0, pressure)) : 0.5;
  const amount = Number.isFinite(sensitivity) ? Math.min(100, Math.max(0, sensitivity)) / 100 : 100;
  return Math.min(1, Math.max(0.08, 0.5 + (raw - 0.5) * amount));
}
