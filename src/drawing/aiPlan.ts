import { parseDrawingPlan, type NativeDrawingCommand } from "./commands";

export interface AIStrokePlan {
  summary: string;
  commands: NativeDrawingCommand[];
}

/**
 * Parse and tightly bound model output before it reaches the approval UI.
 * This first AI drawing workflow intentionally supports stroke additions only.
 */
export function parseAIStrokePlan(raw: string): AIStrokePlan {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Kuro did not return valid JSON for the drawing plan.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The drawing plan must be a JSON object.");
  }
  const candidate = value as { summary?: unknown; commands?: unknown };
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 500) {
    throw new Error("The drawing plan needs a short summary.");
  }
  if (!Array.isArray(candidate.commands)) {
    throw new Error("The drawing plan commands must be an array.");
  }
  if (candidate.commands.length > 12) {
    throw new Error("This first drawing workflow is limited to 12 strokes per plan.");
  }
  if (candidate.commands.some(command =>
    !command || typeof command !== "object" || (command as { type?: unknown }).type !== "stroke.add"
  )) {
    throw new Error("This workflow currently supports native stroke additions only.");
  }
  for (const command of candidate.commands) {
    const points = (command as { points?: unknown }).points;
    if (!Array.isArray(points) || points.length < 1 || points.length > 20) {
      throw new Error("Each proposed stroke must contain between 1 and 20 points.");
    }
  }
  const commands = parseDrawingPlan(JSON.stringify(candidate.commands), {
    width: 1600,
    height: 1200,
    layerIds: ["layer-default"],
    lockedLayerIds: [],
  });
  return { summary: candidate.summary.trim(), commands };
}
