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
  /** Explicit author intent to plant a subtle cameo, clue, or foreshadowing beat. */
  allowAuthorDirectedForeshadowing?: boolean;
}

export interface CanonContextOptions {
  projectId: string;
  userMessage: string;
  maxFacts?: number;
  maxCharacters?: number;
  revealGate?: CanonRevealGateOptions;
}

/**
 * Detect a deliberate author instruction to plant a clue/cameo before its
 * main reveal. This is not enabled by merely discussing a future character:
 * a concrete story-creation action and an intentional clue signal are required.
 */
export function isIntentionalForeshadowingRequest(message: string): boolean {
  const deliberateClue = /\b(?:easter\s*egg|cameo|foreshadow\w*|plant(?:ing)?\s+(?:a\s+)?clue|hidden\s+clue|future\s+(?:character|cameo|payoff)|unrevealed\s+(?:character|figure)|later\s+revealed|turns?\s+out\s+to\s+be|background\s+(?:character|figure|appearance)|blink[- ]and[- ]you[- ]miss[- ]it|brief\s+appearance|bump\w*\s+(?:into|with|against)|pass(?:es|ed|ing)?\s+by|reader\s+won't\s+know|audience\s+won't\s+know)\b/i.test(message);
  // Scene actions cover informal instructions such as "that guy bumps into him
  // in chapter one; later he turns out to be a cameo", even without "write/include".
  const creationAction = /\b(?:write|draft|continue|create|make|include|insert|plant|add|show|draw|render|compose|produce|script|stage|feature|want|plan|set\s+up|introduc\w*|bump\w*|meet|walk|stand|pass\w*|appear|speak|talk)\b/i.test(message);
  return deliberateClue && creationAction;
}

function eligibleRevealStates(options: CanonRevealGateOptions): CharacterEvolutionState[] {
  return options.states.filter(state =>
    state.universeId === options.universeId && state.status === "approved"
    && validateCharacterEvolutionState(state, options.universeId).length === 0);
}

function resolveRevealPoint(options: CanonRevealGateOptions): { timelineId?: string; storyOrder?: number; chapterNumber?: number; ambiguous: boolean } {
  const states = eligibleRevealStates(options);
  let timelineId = options.timelineId;
  let storyOrder = options.storyOrder;
  let chapterNumber = options.chapterNumber;
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
  // Resolve the containing chapter from the latest approved state at or before the
  // target order. This lets chapter-level memories remain useful without guessing.
  // Conflicting chapter mappings are ambiguous and therefore fail closed.
  if (timelineId && storyOrder !== undefined) {
    const priorStates = states.filter(state => state.timelineId === timelineId && state.storyOrder <= storyOrder!);
    if (priorStates.length) {
      const latestOrder = Math.max(...priorStates.map(state => state.storyOrder));
      const chaptersAtLatestOrder = [...new Set(priorStates
        .filter(state => state.storyOrder === latestOrder)
        .map(state => state.chapterNumber)
        .filter((value): value is number => value !== undefined))];
      if (chaptersAtLatestOrder.length === 1) {
        if (chapterNumber === undefined) chapterNumber = chaptersAtLatestOrder[0];
        else if (chapterNumber !== chaptersAtLatestOrder[0]) ambiguous = true;
      } else if (chaptersAtLatestOrder.length > 1) {
        ambiguous = true;
      }
    }
  }
  if (timelineId && storyOrder !== undefined) return { timelineId, storyOrder, ...(chapterNumber === undefined ? {} : { chapterNumber }), ambiguous };
  if (ambiguous) return { timelineId, storyOrder, ambiguous: true };
  return { timelineId, storyOrder, ambiguous: false };
}

export function resolveApprovedRevealPoint(options: CanonRevealGateOptions): { timelineId?: string; storyOrder?: number; chapterNumber?: number; ambiguous: boolean } {
  return resolveRevealPoint(options);
}

function filterUnrevealedCanon(bundle: CanonBundle, gate: CanonRevealGateOptions): {
  bundle: CanonBundle;
  hiddenCount: number;
  unresolvedTarget: boolean;
  hiddenTokens: string[];
  maxStoryOrder?: number;
  timelineId?: string;
} {
  const point = resolveRevealPoint(gate);
  const states = eligibleRevealStates(gate);
  if (gate.allowAuthorDirectedForeshadowing && !point.ambiguous) {
    // The author explicitly asked for an intentional early clue. Keep full author
    // knowledge available to Kuro, while response guidance keeps reader-facing
    // narration at the requested point in the story.
    return { bundle, hiddenCount: 0, unresolvedTarget: false, hiddenTokens: [],
      ...(point.storyOrder === undefined ? {} : { maxStoryOrder: point.storyOrder }),
      ...(point.timelineId ? { timelineId: point.timelineId } : {}) };
  }
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

  const maxStoryOrder = point.storyOrder !== undefined && point.timelineId && !point.ambiguous
    ? point.storyOrder
    : undefined;
  const timelineId = maxStoryOrder === undefined ? undefined : point.timelineId;
  if (!hiddenIds.size) return {
    bundle, hiddenCount: 0, unresolvedTarget: point.ambiguous || point.storyOrder === undefined, hiddenTokens: [],
    ...(maxStoryOrder === undefined ? {} : { maxStoryOrder, ...(timelineId ? { timelineId } : {}) }),
  };
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
    ...(maxStoryOrder === undefined ? {} : { maxStoryOrder, ...(timelineId ? { timelineId } : {}) }),
  };
}

/**
 * Post-generation spoiler check. Prompt rules are advisory; production output that names
 * an unrevealed character is withheld by the application rather than shown to the user.
 */
export function hasUnrevealedCharacterMention(
  output: string,
  bundle: CanonBundle | undefined,
  gate: CanonRevealGateOptions,
): boolean {
  if (!bundle || !gate.enabled || gate.allowAuthorDirectedForeshadowing || !output.trim()) return false;
  const hiddenTokens = filterUnrevealedCanon(bundle, gate).hiddenTokens;
  if (!hiddenTokens.length) return false;
  const normalizePhrase = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const haystack = " " + normalizePhrase(output) + " ";
  return hiddenTokens.some(token => {
    const phrase = normalizePhrase(token);
    return phrase.length >= 3 && haystack.includes(" " + phrase + " ");
  });
}

/** Remove recent dialogue turns that directly mention a still-hidden character before producing story output. */
export function filterConversationTurnsForRevealGate<T extends { content: unknown }>(
  turns: readonly T[],
  bundle: CanonBundle | undefined,
  gate: CanonRevealGateOptions,
): T[] {
  if (!bundle || !gate.enabled || gate.allowAuthorDirectedForeshadowing) return [...turns];
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
  // Cover common narrative-production wording, including requests that omit the words
  // "chapter", "scene", or "panel". Private discussion/research remains unrestricted
  // unless the user also asks to produce an artifact.
  const storyUnit = /\b(?:chapter|scene|panel|episode|page|storyboard|comic|manga|webtoon|story|installment|sequence|narrative|plot\s+beat|story\s+arc|story\s+part|fight\s+sequence|action\s+sequence|final\s+battle|reveal\s+scene|character\s+entrance)\b/i.test(message);
  const explicitOutput = /\b(?:write|draft|continue|generate|illustrate|draw|render|script|produce|compose|start|begin|make|do)\b/i.test(message);
  const privatePlanning = /\b(?:brainstorm|research|discuss|explore|worldbuild|world-building|design the world|build the universe)\b/i.test(message);
  if (privatePlanning && !explicitOutput) return false;
  const productionAction = explicitOutput || /\b(?:create|outline|plan|show|include|depict|appear|feature|build)\b/i.test(message);
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
  let revealMaxStoryOrder: number | undefined;
  let revealTimelineId: string | undefined;
  if (options.revealGate?.enabled) {
    if (options.revealGate.universeId.trim() === "") throw new Error("Choose a universe before applying reveal gates.");
    if (options.revealGate.allowAuthorDirectedForeshadowing) {
      const point = resolveRevealPoint(options.revealGate);
      const storedTimelines = [...new Set(bundle.facts
        .map(fact => fact.timelineId)
        .filter((value): value is string => typeof value === "string" && !!value.trim()))];
      const authorTimeline = point.timelineId ?? options.revealGate.timelineId
        ?? (storedTimelines.length === 1 ? storedTimelines[0] : undefined);
      if (point.ambiguous || (storedTimelines.length > 1 && !authorTimeline)) {
        // Keep project-wide entities visible to the author, but don't mix mutually
        // exclusive time-lined facts when the intended continuity is unresolved.
        source = { ...bundle, facts: bundle.facts.filter(fact => fact.timelineId === undefined && fact.storyOrder === undefined) };
        revealNotice = "AUTHOR-DIRECTED FORESHADOWING: The author explicitly requested an intentional clue/cameo, but the requested point does not resolve to one approved timeline. Project entities and timeless canon remain available; timeline-specific outcomes are omitted to avoid blending parallel histories. Ask which timeline/point applies, or write only what is established independently of those timelines.";
      } else {
        revealNotice = "AUTHOR-DIRECTED FORESHADOWING MODE: The author explicitly requested an intentional early clue/cameo. Use the selected timeline's complete approved canon—including future facts—as AUTHOR-ONLY planning knowledge. Keep the actual chapter/dialogue/art reader-facing: preserve the intended subtlety and do not reveal a secret identity or future payoff on-page unless the author explicitly asks. A deliberate cameo is not an accidental continuity violation.";
        revealTimelineId = authorTimeline;
        // Unlike ordinary sequential production, an explicit author-directed clue needs
        // future knowledge. Timeline scope still applies; chronology is not a content ban.
      }
    } else {
    const filtered = filterUnrevealedCanon(bundle, options.revealGate);
    source = filtered.bundle;
    revealMaxStoryOrder = filtered.maxStoryOrder;
    revealTimelineId = filtered.timelineId;
    if (filtered.unresolvedTarget) {
      revealNotice = "STORY OUTPUT CONTINUITY GUARD: The requested chapter/timeline does not map to one approved story point. Character identities, appearance facts, and reveal-sensitive canon are withheld. Ask for the chapter/timeline mapping rather than inventing which characters or designs belong in this scene.";
    } else if (filtered.hiddenCount) {
      revealNotice = "STORY OUTPUT REVEAL GUARD: Preloaded or not-yet-eligible cast and any facts identifying them have been withheld. Do not name, describe, count, hint at, or otherwise expose withheld characters before their approved reveal point.";
    }
    }
  }

  const authorPlanning = options.revealGate?.enabled === true
    && options.revealGate.allowAuthorDirectedForeshadowing === true;
  const maxFacts = Math.max(1, Math.min(80, Math.floor(options.maxFacts ?? (authorPlanning ? 80 : 24))));
  const maxCharacters = Math.max(500, Math.min(12000, Math.floor(options.maxCharacters ?? (authorPlanning ? 12000 : 5000))));
  const retrieved = retrieveCanon(source, {
    projectId: options.projectId,
    // Intentional foreshadowing needs a broad look at the selected timeline so Kuro
    // can suggest a fitting cameo, not only facts lexically named in the request.
    text: authorPlanning ? "" : options.userMessage,
    statuses: ["approved"],
    ...(revealMaxStoryOrder === undefined ? {} : { maxStoryOrder: revealMaxStoryOrder }),
    ...(revealTimelineId ? { timelineId: revealTimelineId } : {}),
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
    lines.push(authorPlanning
      ? "No approved World Bible facts are available for this selected project/timeline. Do not invent a secret connection; ask the author for the intended character or clue."
      : "No reveal-safe World Bible fact matched this request. Proceed only with details already established in the visible scene.");
  }
  let output = lines.join("\n");
  if (output.length > maxCharacters) {
    output = output.slice(0, maxCharacters - 24).trimEnd() + "\n[Context truncated.]";
  }
  return output;
}
