/**
 * Temporal character canon for long-running stories.
 *
 * A character's identity is stable; their state is versioned by timeline and story order.
 * Approved states are immutable historical snapshots. Proposed makeovers/retcons cannot
 * silently rewrite panels that already exist.
 */
export type EvolutionCanonStatus = "approved" | "proposed" | "superseded";
export type HairLength = "shaved" | "very-short" | "short" | "chin" | "shoulder" | "mid-back" | "waist" | "floor" | "variable" | "unknown";

export interface CharacterAppearanceState {
  /** Explicit age for this state, when known; do not infer it from chapter number. */
  ageYears?: number;
  height?: string;
  build?: string;
  faceAndFeatures?: string;
  hairStyle?: string;
  hairLength?: HairLength;
  hairColor?: string;
  eyeColor?: string;
  skinTone?: string;
  outfitId?: string;
  outfitDescription?: string;
  scarsAndMarks?: string[];
  injuries?: string[];
  accessories?: string[];
  voiceAndMannerisms?: string[];
  abilitiesAndSkills?: string[];
  personalityChanges?: string[];
  visualNotes?: string[];
}

export interface CharacterEvolutionState {
  id: string;
  universeId: string;
  characterId: string;
  timelineId: string;
  /** Monotonically increasing order within this timeline; not necessarily chapter number. */
  storyOrder: number;
  chapterNumber?: number;
  sceneNumber?: number;
  /** In-world date, ISO YYYY-MM-DD, if the story calendar has an exact date. */
  inWorldDate?: string;
  /** Optional stable state this snapshot replaces; historical snapshots remain available. */
  previousStateId?: string;
  status: EvolutionCanonStatus;
  appearance: CharacterAppearanceState;
  emotionalAndBehavioralState?: string;
  relationshipStateRefs: string[];
  assetRefs: string[];
  sourceMessageIds: string[];
  changeSummary: string;
  createdAt: string;
}

const STATUSES: readonly EvolutionCanonStatus[] = ["approved", "proposed", "superseded"];
const HAIR_LENGTHS: readonly HairLength[] = ["shaved", "very-short", "short", "chin", "shoulder", "mid-back", "waist", "floor", "variable", "unknown"];
const optionalStrings = (value: unknown) => value === undefined || typeof value === "string";
const stringArray = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");

export function validateCharacterEvolutionState(value: unknown, expectedUniverseId?: string): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["Character evolution state must be an object."];
  const state = value as Partial<CharacterEvolutionState>;
  for (const key of ["id", "universeId", "characterId", "timelineId", "changeSummary", "createdAt"] as const) {
    if (typeof state[key] !== "string" || !state[key]!.trim()) errors.push("Character evolution state needs " + key + ".");
  }
  if (expectedUniverseId && state.universeId !== expectedUniverseId) errors.push("Character evolution state belongs to another universe.");
  if (!Number.isFinite(state.storyOrder)) errors.push("Character story order must be finite.");
  if (state.chapterNumber !== undefined && (!Number.isInteger(state.chapterNumber) || state.chapterNumber < 0)) errors.push("Chapter number must be a non-negative integer.");
  if (state.sceneNumber !== undefined && (!Number.isInteger(state.sceneNumber) || state.sceneNumber < 0)) errors.push("Scene number must be a non-negative integer.");
  if (state.inWorldDate !== undefined && (typeof state.inWorldDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(state.inWorldDate) || Number.isNaN(Date.parse(state.inWorldDate + "T00:00:00Z")))) errors.push("In-world date must be an ISO YYYY-MM-DD date.");
  if (state.previousStateId !== undefined && (typeof state.previousStateId !== "string" || !state.previousStateId.trim() || state.previousStateId === state.id)) errors.push("Previous state reference is invalid.");
  if (!STATUSES.includes(state.status as EvolutionCanonStatus)) errors.push("Character evolution canon status is invalid.");
  if (!state.appearance || typeof state.appearance !== "object" || Array.isArray(state.appearance)) {
    errors.push("Character appearance snapshot is required.");
  } else {
    const appearance = state.appearance as CharacterAppearanceState;
    if (appearance.ageYears !== undefined && (!Number.isFinite(appearance.ageYears) || appearance.ageYears < 0 || appearance.ageYears > 10000)) errors.push("Character age must be a plausible non-negative numeric value.");
    for (const key of ["height", "build", "faceAndFeatures", "hairStyle", "hairColor", "eyeColor", "skinTone", "outfitId", "outfitDescription"] as const) {
      if (!optionalStrings(appearance[key])) errors.push("Appearance field " + key + " must be text when provided.");
    }
    if (appearance.hairLength !== undefined && !HAIR_LENGTHS.includes(appearance.hairLength)) errors.push("Hair length value is invalid.");
    for (const key of ["scarsAndMarks", "injuries", "accessories", "voiceAndMannerisms", "abilitiesAndSkills", "personalityChanges", "visualNotes"] as const) {
      if (appearance[key] !== undefined && !stringArray(appearance[key])) errors.push("Appearance field " + key + " must be a list of text.");
    }
  }
  if (!optionalStrings(state.emotionalAndBehavioralState)) errors.push("Emotional/behavioral state must be text.");
  for (const key of ["relationshipStateRefs", "assetRefs", "sourceMessageIds"] as const) {
    if (!stringArray(state[key])) errors.push(key + " must be a list of strings.");
  }
  return errors;
}

/** Resolve the latest approved snapshot at a point in one timeline. Future states are never eligible. */
export function characterStateAt(
  states: readonly CharacterEvolutionState[],
  universeId: string,
  characterId: string,
  timelineId: string,
  targetStoryOrder: number,
): CharacterEvolutionState | undefined {
  if (!universeId.trim() || !characterId.trim() || !timelineId.trim() || !Number.isFinite(targetStoryOrder)) {
    throw new Error("Character state lookup needs a universe, character, timeline, and finite story order.");
  }
  const eligible = states.filter(state =>
    validateCharacterEvolutionState(state, universeId).length === 0
    && state.characterId === characterId
    && state.timelineId === timelineId
    && state.status === "approved"
    && state.storyOrder <= targetStoryOrder,
  ).sort((a, b) => b.storyOrder - a.storyOrder || b.createdAt.localeCompare(a.createdAt));
  if (!eligible.length) return undefined;
  const latestOrder = eligible[0].storyOrder;
  const latestStates = eligible.filter(state => state.storyOrder === latestOrder);
  if (latestStates.length > 1) {
    throw new Error("Ambiguous approved character canon: multiple states exist for character " + characterId
      + " on timeline " + timelineId + " at story order " + latestOrder + ". Resolve the conflict before drawing.");
  }
  return structuredClone(latestStates[0]);
}

/** Compute age only when both dates are established; returns undefined rather than guessing. */
export function ageOnInWorldDate(birthDate: string | undefined, inWorldDate: string | undefined): number | undefined {
  const validDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  if (!validDate(birthDate) || !validDate(inWorldDate)) return undefined;
  if (inWorldDate! < birthDate!) return undefined;
  const born = birthDate!.split("-").map(Number);
  const now = inWorldDate!.split("-").map(Number);
  let age = now[0] - born[0];
  if (now[1] < born[1] || (now[1] === born[1] && now[2] < born[2])) age--;
  return age;
}

/** Explain the differences between two approved snapshots for continuity checks and art prompts. */
export function diffCharacterAppearance(
  before: CharacterEvolutionState | undefined,
  after: CharacterEvolutionState,
): Array<{ field: string; before: string; after: string }> {
  const fields: Array<keyof CharacterAppearanceState> = [
    "ageYears", "height", "build", "faceAndFeatures", "hairStyle", "hairLength", "hairColor",
    "eyeColor", "skinTone", "outfitId", "outfitDescription", "scarsAndMarks", "injuries",
    "accessories", "voiceAndMannerisms", "abilitiesAndSkills", "personalityChanges", "visualNotes",
  ];
  return fields.flatMap(field => {
    const oldValue = before?.appearance[field];
    const newValue = after.appearance[field];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];
    return [{ field, before: oldValue === undefined ? "unknown/not recorded" : Array.isArray(oldValue) ? oldValue.join(", ") : String(oldValue),
      after: newValue === undefined ? "unknown/not recorded" : Array.isArray(newValue) ? newValue.join(", ") : String(newValue) }];
  });
}

/** Build a compact, time-specific visual brief; unknown fields remain explicitly unknown. */
export function buildCharacterStateBrief(state: CharacterEvolutionState | undefined, targetStoryOrder: number): string {
  if (!state) return "CHARACTER CONTINUITY: No approved appearance state is recorded at story order " + targetStoryOrder + ". Do not invent age, outfit, hair, scars, or physical changes; request a reference or mark them unknown.";
  const a = state.appearance;
  const lines = [
    "CHARACTER STATE (approved canon; timeline " + state.timelineId + ", story order " + state.storyOrder + "):",
    "Character ID: " + state.characterId,
    "Age: " + (a.ageYears === undefined ? "unknown" : a.ageYears),
    "Height/build: " + [a.height, a.build].filter(Boolean).join(" / ") .concat(!a.height && !a.build ? "unknown" : ""),
    "Face/features: " + (a.faceAndFeatures ?? "unknown"),
    "Hair: " + [a.hairColor, a.hairLength, a.hairStyle].filter(Boolean).join(", ").concat(!a.hairColor && !a.hairLength && !a.hairStyle ? "unknown" : ""),
    "Eyes/skin: " + [a.eyeColor, a.skinTone].filter(Boolean).join(" / ").concat(!a.eyeColor && !a.skinTone ? "unknown" : ""),
    "Outfit: " + [a.outfitId, a.outfitDescription].filter(Boolean).join(" — ").concat(!a.outfitId && !a.outfitDescription ? "unknown" : ""),
    "Scars/marks: " + (a.scarsAndMarks?.join(", ") ?? "unknown"),
    "Injuries: " + (a.injuries?.join(", ") ?? "unknown"),
    "Accessories: " + (a.accessories?.join(", ") ?? "unknown"),
    "Behavior/personality at this point: " + (state.emotionalAndBehavioralState ?? a.personalityChanges?.join(", ") ?? "unknown"),
    "Visual notes: " + (a.visualNotes?.join("; ") ?? "none recorded"),
    "Change summary: " + state.changeSummary,
    "Do not apply a later character state to a flashback or earlier scene.",
  ];
  return lines.join("\n");
}
