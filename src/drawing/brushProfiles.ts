export type BrushPreset = "ink" | "pencil" | "marker" | "airbrush" | "watercolor" | "dry-brush" | "calligraphy";

export interface BrushProfile {
  opacity: number;
  widthMultiplier: number;
  pressureExponent: number;
  shadowBlurMultiplier: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  dashRatio: number;
}

const PROFILES: Record<BrushPreset, BrushProfile> = {
  ink: { opacity: 1, widthMultiplier: 1, pressureExponent: 1, shadowBlurMultiplier: 0, lineCap: "round", lineJoin: "round", dashRatio: 0 },
  pencil: { opacity: 0.68, widthMultiplier: 0.82, pressureExponent: 1.15, shadowBlurMultiplier: 0, lineCap: "round", lineJoin: "round", dashRatio: 0 },
  marker: { opacity: 0.46, widthMultiplier: 1.45, pressureExponent: 0.8, shadowBlurMultiplier: 0, lineCap: "round", lineJoin: "round", dashRatio: 0 },
  airbrush: { opacity: 0.2, widthMultiplier: 1.8, pressureExponent: 0.75, shadowBlurMultiplier: 0.9, lineCap: "round", lineJoin: "round", dashRatio: 0 },
  watercolor: { opacity: 0.19, widthMultiplier: 2.35, pressureExponent: 0.9, shadowBlurMultiplier: 0.45, lineCap: "round", lineJoin: "round", dashRatio: 0 },
  "dry-brush": { opacity: 0.78, widthMultiplier: 1.15, pressureExponent: 1.2, shadowBlurMultiplier: 0, lineCap: "square", lineJoin: "bevel", dashRatio: 0.32 },
  calligraphy: { opacity: 1, widthMultiplier: 1.7, pressureExponent: 1.35, shadowBlurMultiplier: 0, lineCap: "square", lineJoin: "miter", dashRatio: 0 },
};

export function getBrushProfile(preset: BrushPreset): BrushProfile {
  return PROFILES[preset] ?? PROFILES.ink;
}

export function pressureWidth(pressure: number | undefined, baseSize: number, preset: BrushPreset): number {
  const profile = getBrushProfile(preset);
  const normalized = Math.min(1, Math.max(0.08, Number.isFinite(pressure) ? pressure! : 0.5));
  return Math.max(0.25, baseSize * profile.widthMultiplier * Math.pow(normalized, profile.pressureExponent));
}
