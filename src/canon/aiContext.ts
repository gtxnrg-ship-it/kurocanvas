import { retrieveCanon, type CanonBundle } from "./universe";
import { characterRevealStatusAt, validateCharacterEvolutionState, type CharacterEvolutionState } from "./characterEvolution";

export interface CanonRevealGateOptions {
  /** Reveal filtering is enabled only for story/panel production, not private brainstorming. */
  enabled: boolean;
  universeId: string;
  states: readonly CharacterEvolutionState[];
  timelineId?: string;
  storyOrder?: number;
  chapterNumber?: number;
}

export interface CanonContextOptions {
  projectId: string;
  userMessage: string;
  maxFacts?: number;
  maxCharacters?: number;
  revealGate?: CanonRevealGateOptions;
}

function eligibleRevealStates(options: CanonRevealGateOptions): CharacterEvolutionState[] {
  return options.states.filter(state =>
    state.universeId === options.universeId && state.status === "approved"
    && validateCharacterEvolutionState(state, options.universeId).length === 0);
}

function resolveRevealPoint(options: CanonRevealGateOptions): { timelineId?: string; storyOrder?: number; ambiguous: boolean } {
  const states = eligibleRevealStates(options);
  let timelineId = options.timelineId;
  let storyOrder = options.storyOrder;
  let ambiguous = false;
  if (storyOrder !== undefined && !Number.isFinite(storyOrder)) throw new Error("Canon reveal story order must be finite.");
  if (options.chapterNumber !== undefined && (!Number.isInteger(options.chapterNumber) || options.chapterNumber < 0)) {
    throw new Error("Canon reveal chapter number must be a non-negative integer.");
  }

  if (storyOrder === undefined && options.chapterNumber !== undefined) {
    const chapterStates = states.filter(state => state.chapterNumber === options.chapterNumber
      && (!timelineId || state.timelineId === timelineId)
      && characterRevealStatusAt(options.states, options.universeId, state.characterId, state.timelineId, state.storyOrder) !== "hidden");
    const chapterTimelines = [...new Set(chapterStates.map(state => state.timelineId))];
    if (!timelineId && chapterTimelines.length === 1) timelineId = chapterTimelines[0];
    else if (!timelineId && chapterTimelines.length > 1) ambiguous = true;
    if (timelineId) {
      const onTimeline = chapterStates.filter(state => state.timelineId === timelineId);
      if (onTimeline.length) storyOrder = Math.max(...onTimeline.map(state => state.storyOrder));
      else ambiguous = true;
    } else if (!chapterStates.length) ambiguous = true;
  }

  if (storyOrder !== undefined && !timelineId) {
    const activeTimelines = [...new Set(states.filter(state => state.storyOrder <= storyOrder
      && characterRevealStatusAt(options.states, options.universeId, state.characterId, state.timelineId, storyOrder!) !== "hidden")
      .map(state => state.timelineId))];
    if (activeTimelines.length === 1) timelineId = activeTimelines[0];
    else if (activeTimelines.length > 1) ambiguous = true;
  }
  if (timelineId && storyOrder !== undefined) return { timelineId, storyOrder, ambiguous };
  if (ambiguous) return { timelineId, storyOrder, ambiguous: true };
  return { timelineId, storyOrder, ambiguous: false };
}

function filterUnrevealedCanon(bundle: CanonBundle, gate: CanonRevealGateOptions): {
  bundle: CanonBundle;
  hiddenCount: number;
  unresolvedTarget: boolean;
  hiddenTokens: string[];
} {
  const point = resolveRevealPoint(gate);
  const states = eligibleRevealStates(gate);
  const characterEntities = bundle.entities.filter(entity => entity.kind.toLocaleLowerCase() === "character");
  const hiddenIds = new Set<string>();
  const hiddenNames = new Set<string>();

  for (const entity of characterEntities) {
    const allHistory = states.filter(state => state.characterId === entity.id);
    let hidden = true;
    if (point.storyOrder !== undefined && point.timelineId && !point.ambiguous) {
      // A resolved story point may use only an approved state on this exact timeline.
      // "Unknown" is not treated as permission to invent or reveal a preloaded character.
      hidden = characterRevealStatusAt(gate.states, gate.universeId, entity.id, point.timelineId, point.storyOrder) !== "available";
    }
    // If the target is missing or timelines disagree, every character is withheld from
    // generated story context until the author supplies a resolvable point in the timeline.

    if (hidden) {
      hiddenIds.add(entity.id);
      hiddenNames.add(entity.name);
      for (const alias of entity.aliases) if (alias.trim().length >= 3) hiddenNames.add(alias);
    }
  }

  if (!hiddenIds.size) return { bundle, hiddenCount: 0, unresolvedTarget: point.ambiguous || point.storyOrder === undefined, hiddenTokens: [] };
  const publicEntities = bundle.entities.filter(entity => !hiddenIds.has(entity.id));
  const tokens = [...hiddenNames].map(value => value.normalize("NFKC").toLocaleLowerCase().trim()).filter(value => value.length >= 3);
  const refersToHiddenCharacter = (value: unknown) => {
    let serialized = "";
    try { serialized = typeof value === "string" ? value : JSON.stringify(value ?? ""); }
    catch { serialized = String(value); }
    const haystack = serialized.normalize("NFKC").toLocaleLowerCase();
    return tokens.some(token => haystack.includes(token));
  };
  const publicFacts = bundle.facts.filter(fact => !hiddenIds.has(fact.subjectId)
    && !refersToHiddenCharacter(fact.predicate) && !refersToHiddenCharacter(fact.value));
  return {
    bundle: { ...bundle, entities: publicEntities, facts: publicFacts },
    hiddenCount: hiddenIds.size,
    unresolvedTarget: point.ambiguous || point.storyOrder === undefined,
    hiddenTokens: tokens,
  };
}

/** Remove recent dialogue turns that directly mention a still-hidden character before producing story output. */
export function filterConversationTurnsForRevealGate<T extends { content: unknown }>(
  turns: readonly T[],
  bundle: CanonBundle | undefined,
  gate: CanonRevealGateOptions,
): T[] {
  if (!bundle || !gate.enabled) return [...turns];
  const filtered = filterUnrevealedCanon(bundle, gate);
  if (!filtered.hiddenTokens.length) return [...turns];
  const extractText = (value: unknown, depth = 0): string => {
    if (depth > 5 || value == null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(item => extractText(item, depth + 1)).join(" ");
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      return ["text", "content", "value", "title", "name"].map(key => extractText(record[key], depth + 1)).join(" ");
    }
    return "";
  };
  return turns.filter(turn => {
    const text = extractText(turn.content).normalize("NFKC").toLocaleLowerCase();
    return !filtered.hiddenTokens.some(token => text.includes(token));
  });
}

/** Detect requests that create story material, where reveal gates must be enforced. Private brainstorming stays unrestricted. */
export function isStoryProductionRequest(message: string): boolean {
  const storyUnit = /\b(?:chapter|scene|panel|episode|page|storyboard|comic|manga|webtoon)\b/i.test(message);
  const productionAction = /\b(?:write|draft|continue|generate|create|illustrate|draw|render|script|outline|plan|produce|compose|show|include|depict|appear|feature|start|begin|make|build|do)\b/i.test(message);
  return storyUnit && productionAction;
}

/**
 * Builds a bounded, project-scoped context block for an AI request.
 * Only approved canon is included: proposals and inferences must never silently
 * become facts the assistant presents as true. During production, preloaded future
 * characters and any canon facts that name them are filtered behind their reveal gate.
 */
export function buildApprovedCanonContext(
  bundle: CanonBundle | undefined,
  options: CanonContextOptions,
): string {
  if (!bundle) return "";
  if (!options.projectId.trim()) throw new Error("Choose a project before retrieving canon.");
  if (bundle.projectId !== options.projectId) {
    throw new Error("Canon context refused: the saved World Bible does not belong to the active project.");
  }

  let source = bundle;
  let revealNotice = "";
  if (options.revealGate?.enabled) {
    if (options.revealGate.universeId.trim() === "") throw new Error("Choose a universe before applying reveal gates.");
    const filtered = filterUnrevealedCanon(bundle, options.revealGate);
    source = filtered.bundle;
    if (filtered.unresolvedTarget) {
      revealNotice = "STORY OUTPUT CONTINUITY GUARD: The requested chapter/timeline does not map to one approved story point. Character identities, appearance facts, and reveal-sensitive canon are withheld. Ask for the chapter/timeline mapping rather than inventing which characters or designs belong in this scene.";
    } else if (filtered.hiddenCount) {
      revealNotice = "STORY OUTPUT REVEAL GUARD: Preloaded or not-yet-eligible cast and any facts identifying them have been withheld. Do not name, describe, count, hint at, or otherwise expose withheld characters before their approved reveal point.";
    }
  }

  const maxFacts = Math.max(1, Math.min(80, Math.floor(options.maxFacts ?? 24)));
  const maxCharacters = Math.max(500, Math.min(12000, Math.floor(options.maxCharacters ?? 5000)));
  const retrieved = retrieveCanon(source, {
    projectId: options.projectId,
    text: options.userMessage,
    statuses: ["approved"],
    limit: maxFacts,
  });
  if ((!retrieved.entities.length || !retrieved.facts.length) && !revealNotice) return "";
  const entityNames = new Map(retrieved.entities.map(entity => [entity.id, entity.name]));
  const lines: string[] = [
    "PROJECT WORLD BIBLE — APPROVED CANON ONLY",
    "Treat the following as established facts for this project. Do not invent missing details or promote proposals to canon.",
    "If a relevant fact is absent or ambiguous, say it is not established in the saved World Bible.",
  ];
  if (revealNotice) lines.push(revealNotice);
  for (const entity of retrieved.entities) {
    lines.push(`Character/world entity: ${entity.name} (${entity.kind})`);
  }
  for (const fact of retrieved.facts) {
    const subject = entityNames.get(fact.subjectId) ?? retrieved.entities.find(e => e.id === fact.subjectId)?.name ?? fact.subjectId;
    let value: string;
    try { value = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value); }
    catch { value = String(fact.value); }
    lines.push(`- ${subject} — ${fact.predicate}: ${value ?? "null"}${fact.storyOrder === undefined ? "" : ` (story order ${fact.storyOrder})`}`);
  }
  if (retrieved.entities.length === 0 && retrieved.facts.length === 0 && revealNotice) {
    lines.push("No reveal-safe World Bible fact matched this request. Proceed only with details already established in the visible scene.");
  }
  let output = lines.join("\n");
  if (output.length > maxCharacters) {
    output = output.slice(0, maxCharacters - 24).trimEnd() + "\n[Context truncated.]";
  }
  return output;
}
