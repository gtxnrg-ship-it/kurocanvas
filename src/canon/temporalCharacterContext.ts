import {
  buildCharacterStateBrief,
  characterStateAt,
  type CharacterEvolutionState,
} from "./characterEvolution";

export interface TemporalCharacterContextOptions {
  universeId: string;
  timelineId: string;
  storyOrder: number;
  characterIds: readonly string[];
  maxCharacters?: number;
  maxOutputCharacters?: number;
}

/**
 * Resolve approved character states for one exact story point.
 * Missing states are explicit; future states, proposals, other timelines, and
 * other universes cannot leak into the prompt.
 */
export function buildTemporalCharacterContext(
  states: readonly CharacterEvolutionState[],
  options: TemporalCharacterContextOptions,
): string {
  if (!options.universeId.trim() || !options.timelineId.trim()) {
    throw new Error("Temporal character context requires an explicit universe and timeline.");
  }
  if (!Number.isFinite(options.storyOrder)) {
    throw new Error("Temporal character context requires a finite story order.");
  }
  const maxCharacters = Number.isFinite(options.maxCharacters)
    ? Math.max(1, Math.min(100, Math.floor(options.maxCharacters!))) : 24;
  const maxOutputCharacters = Number.isFinite(options.maxOutputCharacters)
    ? Math.max(500, Math.min(30000, Math.floor(options.maxOutputCharacters!))) : 10000;
  const ids = [...new Set(options.characterIds.filter(id => typeof id === "string" && id.trim()))].slice(0, maxCharacters);
  if (!ids.length) return "TEMPORAL CHARACTER CANON: No character IDs were selected. Do not invent which character versions apply.";
  const lines = [
    "TEMPORAL CHARACTER CANON — APPROVED STATES ONLY",
    "Universe: " + options.universeId,
    "Timeline: " + options.timelineId,
    "Target story order: " + options.storyOrder,
    "Only use states at or before this story order. Never apply a later makeover to an earlier scene.",
    "A missing state means unknown, not permission to invent continuity.",
  ];
  for (const id of ids) {
    const state = characterStateAt(states, options.universeId, id, options.timelineId, options.storyOrder);
    lines.push(buildCharacterStateBrief(state, options.storyOrder));
  }
  let output = lines.join("\n\n");
  if (output.length > maxOutputCharacters) output = output.slice(0, maxOutputCharacters - 24).trimEnd() + "\n[Temporal context truncated.]";
  return output;
}
