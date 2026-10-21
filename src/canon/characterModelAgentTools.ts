import { parseModelJson } from "../ai/structuredOutput";

export type CharacterCameraPreset =
  | "front"
  | "three-quarter-left"
  | "three-quarter-right"
  | "profile-left"
  | "profile-right"
  | "back"
  | "close-up"
  | "full-body"
  | "high-angle";

export type CharacterMotionPreset = "idle" | "relaxed" | "flex" | "combat-ready";

export type CharacterModelAgentCommand =
  | { version: 1; id: string; type: "model.createBlockout"; characterName: string; characterStateId?: string; hair?: string; age?: string; outfit?: string; skinTone?: string; eyeColor?: string; bodyType?: "slim" | "average" | "athletic" | "stocky" }
  | { version: 1; id: string; type: "model.motionPreset"; preset: CharacterMotionPreset }
  | { version: 1; id: string; type: "camera.preset"; preset: CharacterCameraPreset }
  | { version: 1; id: string; type: "camera.zoom"; factor: number }
  | { version: 1; id: string; type: "model.rotateView"; degrees: number }
  | { version: 1; id: string; type: "model.resetViewRotation" };

export interface CharacterModelAgentPlan {
  summary: string;
  commands: CharacterModelAgentCommand[];
}

const PRESETS = new Set<CharacterCameraPreset>([
  "front", "three-quarter-left", "three-quarter-right", "profile-left", "profile-right",
  "back", "close-up", "full-body", "high-angle",
]);
const MAX_ACTIONS = 8;
const MAX_RESPONSE_CHARS = 24_000;

/** Recognize explicit native 3D-viewport requests; this does not invoke image generation. */
export function isCharacterModelToolRequest(message: string): boolean {
  const text = message.normalize("NFKC");
  if (/\b(?:create|build|make|construct)\s+(?:a|an|the|me\s+a)?\s*(?:new\s+)?(?:3d\s+)?(?:character\s+)?(?:model|blockout|figure)\b/i.test(text)) return true;
  if (/\b(?:make|put|set)\s+(?:the\s+)?(?:character|model)\s+(?:flex|flexing|combat[- ]ready|relaxed|idle|stand(?:ing)?)\b/i.test(text)
    || /\b(?:flex|flexing|combat[- ]ready|idle animation|motion preset)\b/i.test(text) && /\b(?:character|model|3d|figure|avatar)\b/i.test(text)) return true;
  if (/\b(?:camera|orbit controls?|camera angle|viewport angle|zoom in|zoom out|pan the view)\b/i.test(text)) {
    return /\b(?:character|model|3d|viewport|view|figure|avatar|scene|camera|orbit|zoom)\b/i.test(text);
  }
  return /\b(?:rotate|turn|spin)\s+(?:the\s+)?(?:3d\s+)?(?:character\s+)?model\b/i.test(text)
    || /\b(?:front view|side view|profile view|back view|three[- ]quarter view|full[- ]body view|close[- ]up view)\b/i.test(text);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate untrusted model output against a small allowlist of reversible viewport actions. */
export function parseCharacterModelAgentPlan(raw: string): CharacterModelAgentPlan {
  if (raw.length > MAX_RESPONSE_CHARS) throw new Error("The 3D tool plan exceeds the response-size limit.");
  let parsed: unknown;
  try { parsed = parseModelJson(raw, MAX_RESPONSE_CHARS); }
  catch { throw new Error("Kuro did not return valid JSON for the 3D tool plan (after structured-output recovery)."); }
  if (!isObject(parsed)) throw new Error("The 3D tool plan must be a JSON object.");
  if (typeof parsed.summary !== "string" || !parsed.summary.trim() || parsed.summary.length > 500) {
    throw new Error("The 3D tool plan needs a short, meaningful summary.");
  }
  if (!Array.isArray(parsed.commands) || parsed.commands.length > MAX_ACTIONS) {
    throw new Error("The 3D tool plan must contain at most " + MAX_ACTIONS + " commands.");
  }
  const seen = new Set<string>();
  const commands: CharacterModelAgentCommand[] = [];
  for (const rawCommand of parsed.commands) {
    if (!isObject(rawCommand) || rawCommand.version !== 1 || typeof rawCommand.id !== "string"
      || !rawCommand.id.trim() || rawCommand.id.length > 120 || seen.has(rawCommand.id)
      || typeof rawCommand.type !== "string") {
      throw new Error("Every 3D tool command needs a unique ID, version 1, and a supported type.");
    }
    seen.add(rawCommand.id);
    if (rawCommand.type === "model.createBlockout") {
      const allowed = ["version", "id", "type", "characterName", "characterStateId", "hair", "age", "outfit", "skinTone", "eyeColor", "bodyType"];
      if (Object.keys(rawCommand).some(key => !allowed.includes(key))
        || typeof rawCommand.characterName !== "string" || !rawCommand.characterName.trim() || rawCommand.characterName.length > 120) {
        throw new Error("Native model creation needs a character name and only supported trait fields.");
      }
      if (rawCommand.characterStateId !== undefined && (typeof rawCommand.characterStateId !== "string" || !rawCommand.characterStateId.trim() || rawCommand.characterStateId.length > 160)) throw new Error("Character state ID must be a non-empty bounded string.");
      for (const key of ["hair", "age", "outfit", "skinTone", "eyeColor"] as const) {
        if (rawCommand[key] !== undefined && (typeof rawCommand[key] !== "string" || rawCommand[key].trim().length > 160)) {
          throw new Error("Character trait " + key + " must be a string of at most 160 characters.");
        }
      }
      if (rawCommand.bodyType !== undefined && !["slim", "average", "athletic", "stocky"].includes(String(rawCommand.bodyType))) {
        throw new Error("Native model body type is unsupported.");
      }
      commands.push({
        version: 1, id: rawCommand.id, type: "model.createBlockout", characterName: rawCommand.characterName.trim(),
        ...(typeof rawCommand.characterStateId === "string" ? { characterStateId: rawCommand.characterStateId.trim() } : {}),
        ...(typeof rawCommand.hair === "string" ? { hair: rawCommand.hair.trim() } : {}),
        ...(typeof rawCommand.age === "string" ? { age: rawCommand.age.trim() } : {}),
        ...(typeof rawCommand.outfit === "string" ? { outfit: rawCommand.outfit.trim() } : {}),
        ...(typeof rawCommand.skinTone === "string" ? { skinTone: rawCommand.skinTone.trim() } : {}),
        ...(typeof rawCommand.eyeColor === "string" ? { eyeColor: rawCommand.eyeColor.trim() } : {}),
        ...(rawCommand.bodyType !== undefined ? { bodyType: rawCommand.bodyType as "slim" | "average" | "athletic" | "stocky" } : {}),
      });
    } else if (rawCommand.type === "model.motionPreset") {
      if (Object.keys(rawCommand).some(key => !["version", "id", "type", "preset"].includes(key))
        || !["idle", "relaxed", "flex", "combat-ready"].includes(String(rawCommand.preset))) {
        throw new Error("Motion preset must be idle, relaxed, flex, or combat-ready.");
      }
      commands.push({ version: 1, id: rawCommand.id, type: "model.motionPreset", preset: rawCommand.preset as CharacterMotionPreset });
    } else if (rawCommand.type === "camera.preset") {
      if (Object.keys(rawCommand).some(key => !["version", "id", "type", "preset"].includes(key))
        || typeof rawCommand.preset !== "string" || !PRESETS.has(rawCommand.preset as CharacterCameraPreset)) {
        throw new Error("Camera preset is unknown or contains unsupported fields.");
      }
      commands.push({ version: 1, id: rawCommand.id, type: "camera.preset", preset: rawCommand.preset as CharacterCameraPreset });
    } else if (rawCommand.type === "camera.zoom") {
      if (Object.keys(rawCommand).some(key => !["version", "id", "type", "factor"].includes(key))
        || typeof rawCommand.factor !== "number" || !Number.isFinite(rawCommand.factor)
        || rawCommand.factor < 0.65 || rawCommand.factor > 1.8) {
        throw new Error("Camera zoom factor must be between 0.65 and 1.8.");
      }
      commands.push({ version: 1, id: rawCommand.id, type: "camera.zoom", factor: rawCommand.factor });
    } else if (rawCommand.type === "model.rotateView") {
      if (Object.keys(rawCommand).some(key => !["version", "id", "type", "degrees"].includes(key))
        || typeof rawCommand.degrees !== "number" || !Number.isFinite(rawCommand.degrees)
        || rawCommand.degrees < -180 || rawCommand.degrees > 180) {
        throw new Error("Viewport model rotation must be between -180 and 180 degrees.");
      }
      commands.push({ version: 1, id: rawCommand.id, type: "model.rotateView", degrees: rawCommand.degrees });
    } else if (rawCommand.type === "model.resetViewRotation") {
      if (Object.keys(rawCommand).some(key => !["version", "id", "type"].includes(key))) {
        throw new Error("Reset rotation does not accept extra fields.");
      }
      commands.push({ version: 1, id: rawCommand.id, type: "model.resetViewRotation" });
    } else {
      throw new Error("Unsupported 3D tool command: " + rawCommand.type);
    }
  }
  return { summary: parsed.summary.trim(), commands };
}

export function describeCharacterModelAgentCommand(command: CharacterModelAgentCommand): string {
  switch (command.type) {
    case "model.createBlockout": return "Create native procedural 3D blockout for " + command.characterName + (command.characterStateId ? " at approved character state " + command.characterStateId : " as the base model");
    case "model.motionPreset": return "Animate procedural character preview: " + command.preset.replace(/-/g, " ");
    case "camera.preset": return "Set camera to " + command.preset.replace(/-/g, " ") + " view";
    case "camera.zoom": return (command.factor >= 1 ? "Zoom in " : "Zoom out ") + Math.round(Math.abs(command.factor - 1) * 100) + "%";
    case "model.rotateView": return "Rotate displayed model by " + command.degrees + "° (view only)";
    case "model.resetViewRotation": return "Reset displayed model orientation";
  }
}
