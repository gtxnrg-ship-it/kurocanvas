import {
  buildCharacterStateBrief,
  characterStateAt,
  validateCharacterEvolutionState,
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

export interface TemporalCharacterResolutionOptions {
  universeId: string;
  characterIds: readonly string[];
  timelineId?: string;
  storyOrder?: number;
  chapterNumber?: number;
  sceneNumber?: number;
  maxCharacters?: number;
  maxOutputCharacters?: number;
}
export type TemporalCharacterResolution =
  | { status: "resolved"; timelineId: string; storyOrder: number; context: string }
  | { status: "ambiguous" | "unknown"; context: string };

/**
 * Resolve natural chapter references against persisted chapter metadata. A chapter
 * number is never silently treated as storyOrder: flashbacks and out-of-order scenes
 * make those different coordinates. When current continuity spans multiple timelines,
 * Kuro must ask which timeline rather than blending states.
 */
export function resolveTemporalCharacterContext(
  states: readonly CharacterEvolutionState[],
  options: TemporalCharacterResolutionOptions,
): TemporalCharacterResolution {
  if (!options.universeId.trim()) throw new Error("Temporal character resolution requires a universe.");
  const characterIds = [...new Set(options.characterIds.filter(id => typeof id === "string" && id.trim()))];
  if (!characterIds.length) {
    return { status: "unknown", context: "TEMPORAL CANON: No approved character IDs match this request. Do not invent a character identity or design." };
  }
  const belongsToRequest = (state: CharacterEvolutionState) =>
    state.universeId === options.universeId
    && characterIds.includes(state.characterId)
    && state.status === "approved"
    && validateCharacterEvolutionState(state, options.universeId).length === 0;
  const relevant = states.filter(belongsToRequest);
  const timelineIds = [...new Set(relevant.map(state => state.timelineId))];
  const withTimeline = (state: CharacterEvolutionState) => !options.timelineId || state.timelineId === options.timelineId;

  let timelineId = options.timelineId;
  let storyOrder = options.storyOrder;

  if (options.storyOrder !== undefined && !Number.isFinite(options.storyOrder)) {
    throw new Error("Explicit story order must be a finite number.");
  }
  if (options.chapterNumber !== undefined && (!Number.isInteger(options.chapterNumber) || options.chapterNumber < 0)) {
    throw new Error("Chapter number must be a non-negative integer.");
  }
  if (options.sceneNumber !== undefined && (!Number.isInteger(options.sceneNumber) || options.sceneNumber < 0)) {
    throw new Error("Scene number must be a non-negative integer.");
  }

  if (storyOrder === undefined && options.chapterNumber !== undefined) {
    const chapterStates = relevant.filter(state =>
      withTimeline(state)
      && state.chapterNumber === options.chapterNumber
      && (options.sceneNumber === undefined || state.sceneNumber === options.sceneNumber));
    if (!chapterStates.length) {
      return {
        status: "unknown",
        context: "TEMPORAL CANON: No approved character state is linked to Chapter " + options.chapterNumber
          + (options.sceneNumber === undefined ? "" : ", Scene " + options.sceneNumber)
          + (timelineId ? " on timeline " + timelineId : "") + ". Do not substitute the chapter number for story order or invent appearance details.",
      };
    }
    const chapterTimelines = [...new Set(chapterStates.map(state => state.timelineId))];
    if (!timelineId && chapterTimelines.length > 1) {
      return {
        status: "ambiguous",
        context: "TEMPORAL CANON AMBIGUITY: Chapter " + options.chapterNumber + " has approved character states on multiple timelines ("
          + chapterTimelines.join(", ") + "). Ask which timeline applies; do not combine their appearances.",
      };
    }
    timelineId = timelineId ?? chapterTimelines[0];
    const timelineChapterStates = chapterStates.filter(state => state.timelineId === timelineId);
    storyOrder = Math.max(...timelineChapterStates.map(state => state.storyOrder));
    if (options.sceneNumber !== undefined) {
      // Scene selection already narrowed states; if scene metadata maps to more than one
      // story point, the data cannot identify a unique frame for continuity.
      const sceneOrders = [...new Set(timelineChapterStates.map(state => state.storyOrder))];
      if (sceneOrders.length > 1) {
        return { status: "ambiguous", context: "TEMPORAL CANON AMBIGUITY: the selected chapter and scene map to more than one story order. Ask for the intended scene position." };
      }
    }
  }

  if (!timelineId) {
    if (timelineIds.length > 1) {
      return {
        status: "ambiguous",
        context: "TEMPORAL CANON AMBIGUITY: approved character history exists on multiple timelines (" + timelineIds.join(", ")
          + "). Ask which timeline applies before describing appearance or relationship continuity.",
      };
    }
    timelineId = timelineIds[0];
  }
  if (!timelineId) {
    return { status: "unknown", context: "TEMPORAL CANON: No approved timeline is recorded for the selected characters in this universe. Ask for a reference or mark their design unknown." };
  }

  const matchingTimelineStates = relevant.filter(state => state.timelineId === timelineId);
  if (storyOrder === undefined) {
    if (!matchingTimelineStates.length) {
      return { status: "unknown", context: "TEMPORAL CANON: No approved appearance state exists on timeline " + timelineId + " for the selected characters. Do not invent continuity." };
    }
    storyOrder = Math.max(...matchingTimelineStates.map(state => state.storyOrder));
  }

  return {
    status: "resolved",
    timelineId,
    storyOrder,
    context: buildTemporalCharacterContext(states, {
      universeId: options.universeId, timelineId, storyOrder, characterIds,
      maxCharacters: options.maxCharacters, maxOutputCharacters: options.maxOutputCharacters,
    }),
  };
}
