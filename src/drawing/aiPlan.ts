import { parseDrawingPlan, type DrawingDocumentBounds, type NativeDrawingCommand } from "./commands";

export interface AIStrokePlan {
  summary: string;
  commands: NativeDrawingCommand[];
}

const AI_ALLOWED_TYPES = new Set(["stroke.add", "stroke.remove", "stroke.update", "layer.setVisibility", "layer.setOpacity", "layer.setLock"]);
const DEFAULT_BOUNDS: DrawingDocumentBounds = { width: 1600, height: 1200, layerIds: ["layer-default"], lockedLayerIds: [] };

/**
 * Parse bounded, allowlisted model output against the active document.
 * Kuro may propose additions, removals, and safe layer-property changes only;
 * structural/destructive actions outside this allowlist remain unavailable.
 */
export function parseAIStrokePlan(raw: string, bounds: DrawingDocumentBounds = DEFAULT_BOUNDS): AIStrokePlan {
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
    throw new Error("This drawing workflow is limited to 12 native actions per plan.");
  }
  for (const command of candidate.commands) {
    if (!command || typeof command !== "object" || Array.isArray(command)
      || !AI_ALLOWED_TYPES.has(String((command as { type?: unknown }).type))) {
      throw new Error("This workflow only accepts approved native stroke and layer-property actions.");
    }
    const item = command as { type: string; points?: unknown };
    if ((item.type === "stroke.remove" || item.type === "stroke.update") && !bounds.strokeLayerById) throw new Error("Stroke edits require active document context.");
    if (item.type === "stroke.add" && (!Array.isArray(item.points) || item.points.length < 1 || item.points.length > 20)) {
      throw new Error("Each proposed stroke must contain between 1 and 20 points.");
    }
  }
  const commands = parseDrawingPlan(JSON.stringify(candidate.commands), bounds);
  return { summary: candidate.summary.trim(), commands };
}


export type AIPlanAttempt =
  | { mode: "initial" }
  | { mode: "repair"; previousOutput: string; validationError: string };

export interface ValidatedAIPlanResult {
  plan: AIStrokePlan;
  repaired: boolean;
}

/**
 * Ask for a native plan with one strictly bounded repair attempt. Repairs receive
 * the exact validator error and original output, but all output still passes through
 * the same allowlist/document validator; retrying never grants extra tool permission.
 * Empty plans are valid no-ops and are not retried.
 */
export async function requestAIStrokePlan(
  generate: (attempt: AIPlanAttempt) => Promise<string>,
  bounds: DrawingDocumentBounds = DEFAULT_BOUNDS,
): Promise<ValidatedAIPlanResult> {
  const firstOutput = await generate({ mode: "initial" });
  try {
    return { plan: parseAIStrokePlan(firstOutput, bounds), repaired: false };
  } catch (firstError) {
    const validationError = firstError instanceof Error ? firstError.message : "The plan failed native validation.";
    let repairedOutput: string;
    try {
      repairedOutput = await generate({ mode: "repair", previousOutput: firstOutput, validationError });
    } catch (repairError) {
      const reason = repairError instanceof Error ? repairError.message : "The model could not perform its repair attempt.";
      throw new Error("Kuro's first drawing plan failed validation (" + validationError + "); the single repair attempt failed: " + reason);
    }
    try {
      return { plan: parseAIStrokePlan(repairedOutput, bounds), repaired: true };
    } catch (repairError) {
      const reason = repairError instanceof Error ? repairError.message : "The repaired plan failed native validation.";
      throw new Error("Kuro's drawing plan failed validation after one repair attempt: " + reason);
    }
  }
}
