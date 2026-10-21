export const MAX_CUSTOM_SWATCHES = 16;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizePalette(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !HEX_COLOR.test(item)) continue;
    const color = item.toLowerCase();
    if (!result.includes(color)) result.push(color);
    if (result.length >= MAX_CUSTOM_SWATCHES) break;
  }
  return result;
}

export function addPaletteColor(colors: unknown, candidate: string): { colors: string[]; added: boolean; reason?: "invalid" | "duplicate" | "full" } {
  const current = normalizePalette(colors);
  if (!HEX_COLOR.test(candidate)) return { colors: current, added: false, reason: "invalid" };
  const color = candidate.toLowerCase();
  if (current.includes(color)) return { colors: current, added: false, reason: "duplicate" };
  if (current.length >= MAX_CUSTOM_SWATCHES) return { colors: current, added: false, reason: "full" };
  return { colors: [...current, color], added: true };
}

export function removePaletteColor(colors: unknown, candidate: string): string[] {
  const color = candidate.toLowerCase();
  return normalizePalette(colors).filter(item => item !== color);
}
