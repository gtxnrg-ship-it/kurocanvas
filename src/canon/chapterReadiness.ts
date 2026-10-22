import type { CanonBundle } from "./universe";
import type { ArtDirectionBible } from "./artDirection";
import type { ProjectStyleBible } from "./styleBible";
import type { CharacterEvolutionState } from "./characterEvolution";
import type { RelationshipRecord } from "./relationshipMemory";
import type { ResearchTaskRecord } from "../research/researchQueue";
import { evaluateSeriesPlan, evaluateSeriesProductionRequest, type SeriesPlanFields } from "./seriesPlan";

export interface ChapterReadinessInput {
  hasUniverse: boolean;
  canon?: Pick<CanonBundle, "entities" | "facts">;
  artDirection?: Pick<ArtDirectionBible, "title" | "premise" | "genres" | "visualStyle"> & Partial<Pick<ArtDirectionBible, "seriesScope" | "seriesArcPlan" | "seriesChapterPlan" | "seriesEnding" | "seriesPlanApproved" | "seriesPlanApprovalSignature" | "seriesChapterProgress">>;
  styleBible?: Pick<ProjectStyleBible, "characterStates">;
  characterTimelines?: Array<Pick<CharacterEvolutionState, "characterId" | "timelineId" | "storyOrder" | "status">>;
  relationships?: Array<Pick<RelationshipRecord, "characterAId" | "characterBId">>;
  researchTasks?: Array<Pick<ResearchTaskRecord, "status" | "sources">>;
  requiresHistoricalResearch?: boolean;
  requestedChapterNumber?: number;
  allowChapterRevision?: boolean;
  pendingReviewChapterNumber?: number;
}

export interface ChapterReadinessGap {
  id: "universe" | "world" | "cast" | "art-direction" | "series-plan" | "series-sequence" | "character-design" | "timeline" | "relationships" | "research" | "verification";
  message: string;
}

export interface ChapterReadinessReport {
  ready: boolean;
  approvedCharacterCount: number;
  approvedWorldFactCount: number;
  approvedRelationshipCount: number;
  targetSeriesChapterNumber?: number;
  seriesRevision?: boolean;
  seriesComplete?: boolean;
  gaps: ChapterReadinessGap[];
}

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const normalize = (value: string): string => value.normalize("NFKC").toLocaleLowerCase().trim();
const WORLD_FACT_PREDICATE = /world|setting|rule|location|history|timeline|culture|power|faction|geograph|technolog|conflict|government|magic|religion|school|nation|era|city|kingdom|country|economy|language|politic|climate|calendar|species|system|tradition|law|custom/i;
const VISUAL_TRAITS = ["age", "hair", "eyes", "scars", "outfit", "body", "accessories", "injuries", "other"] as const;
/**
 * A whole-series outline is foundation work, not chapter production. Keep it in
 * chat even when a format detector notices words like Webtoon, episode, or chapter.
 */
export function isWholeSeriesPlanningRequest(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (!text) return false;
  const plansWholeWork = /\b(?:whole|entire|full|complete)\s+(?:creative\s+)?(?:series|story|season|saga|narrative)\b|\ball\s+(?:planned\s+)?(?:chapters|episodes)\b|\bfrom\s+(?:chapter\s+1|the\s+first\s+chapter|the\s+beginning)\s+(?:through|to|until)\s+(?:the\s+)?(?:finale|ending|last\s+chapter|last\s+episode)\b/i.test(text);
  const planningAction = /\b(?:plan|outline|map|structure|architect|brainstorm|develop)\b/i.test(text);
  return plansWholeWork && planningAction;
}


/**
 * Deterministic preflight for sequential chapter production. Discussion remains open at every
 * stage, but auto-drawing is held until approved world, cast, timeline, and visual foundations
 * exist. This is a minimum completeness gate, not an AI judgement about artistic quality.
 */
export function evaluateChapterReadiness(input: ChapterReadinessInput): ChapterReadinessReport {
  const gaps: ChapterReadinessGap[] = [];
  if (!input.hasUniverse) {
    gaps.push({ id: "universe", message: "Create or select the universe that owns this chapter, so its canon and reveal rules stay isolated." });
  }

  const canon = input.canon;
  const entities = canon?.entities ?? [];
  const approvedCharacters = entities.filter(entity => entity.status === "approved" && normalize(entity.kind) === "character");
  const approvedCharacterIds = new Set(approvedCharacters.map(entity => entity.id));
  const approvedCharacterNames = new Set(approvedCharacters.flatMap(entity => [entity.name, ...(entity.aliases ?? [])].map(normalize)));
  const approvedWorldEntities = entities.filter(entity => entity.status === "approved" && normalize(entity.kind) !== "character");
  const worldEntityIds = new Set(approvedWorldEntities.map(entity => entity.id));
  const approvedWorldFacts = (canon?.facts ?? []).filter(fact =>
    fact.status === "approved" && (worldEntityIds.has(fact.subjectId) || WORLD_FACT_PREDICATE.test(clean(fact.predicate)))
  );

  if (!canon || approvedWorldEntities.length === 0 || approvedWorldFacts.length < 3) {
    gaps.push({
      id: "world",
      message: "Approve the world's core setting/rules and at least three source-grounded or explicitly fictional world facts in World Bible.",
    });
  }
  if (approvedCharacters.length === 0) {
    gaps.push({ id: "cast", message: "Approve at least one character in World Bible; proposed names alone are not stable canon." });
  }

  const artDirection = input.artDirection;
  if (!clean(artDirection?.title) || !clean(artDirection?.premise) || !clean(artDirection?.genres) || !clean(artDirection?.visualStyle)) {
    gaps.push({ id: "art-direction", message: "Complete the project's title, premise, genres, and unified visual style in Art Direction." });
  }
  const seriesFields = (artDirection ?? {}) as SeriesPlanFields;
  const seriesPlan = evaluateSeriesPlan(seriesFields);
  let targetSeriesChapterNumber: number | undefined;
  let seriesRevision = false;
  let seriesComplete = false;
  if (!seriesPlan.approved) {
    const missing = seriesPlan.issues.filter(issue => issue.id !== "approval").map(issue => issue.message);
    const guidance = seriesPlan.valid
      ? "The outline is complete, but it is not approved yet. Review it in Art Direction and select “Review and approve full series.”"
      : missing.join(" ");
    gaps.push({
      id: "series-plan",
      message: "Complete and explicitly approve the entire series plan in Art Direction before chapter production. " +
        (guidance || "The plan changed after approval, so it must be reviewed and approved again."),
    });
  } else {
    const production = evaluateSeriesProductionRequest(
      seriesFields,
      input.requestedChapterNumber,
      input.allowChapterRevision === true,
      input.pendingReviewChapterNumber,
    );
    targetSeriesChapterNumber = production.targetChapterNumber;
    seriesRevision = production.revision;
    seriesComplete = production.complete;
    if (!production.allowed) {
      gaps.push({
        id: "series-sequence",
        message: production.message ?? "Follow the approved chapter sequence and review each saved chapter before continuing.",
      });
    }
  }


  const visualizedNames = new Set((input.styleBible?.characterStates ?? [])
    .filter(state => state.status === "approved" && VISUAL_TRAITS.filter(key => clean(state[key])).length >= 3)
    .map(state => normalize(state.characterName))
    .filter(name => approvedCharacterNames.has(name)));
  const charactersWithoutVisualDesign = approvedCharacters.filter(character =>
    ![character.name, ...(character.aliases ?? [])].some(name => visualizedNames.has(normalize(name)))
  );
  if (charactersWithoutVisualDesign.length > 0) {
    const names = charactersWithoutVisualDesign.slice(0, 5).map(character => character.name).join(", ");
    gaps.push({
      id: "character-design",
      message: "Approve a Style Bible visual state with at least three established traits (such as hair, eyes, outfit, age, or silhouette) for every approved character. Still missing: " + names + (charactersWithoutVisualDesign.length > 5 ? ", and " + (charactersWithoutVisualDesign.length - 5) + " more." : "."),
    });
  }

  const timelineCharacterIds = new Set((input.characterTimelines ?? [])
    .filter(state => state.status === "approved" && clean(state.timelineId).length > 0 &&
      Number.isFinite(state.storyOrder) && state.storyOrder >= 0)
    .map(state => state.characterId)
    .filter(id => approvedCharacterIds.has(id)));
  const charactersWithoutTimeline = approvedCharacters.filter(character => !timelineCharacterIds.has(character.id));
  if (charactersWithoutTimeline.length > 0) {
    const names = charactersWithoutTimeline.slice(0, 5).map(character => character.name).join(", ");
    gaps.push({
      id: "timeline",
      message: "Approve a timeline state with story order for every approved character in Character Timeline. Still missing: " + names + (charactersWithoutTimeline.length > 5 ? ", and " + (charactersWithoutTimeline.length - 5) + " more." : "."),
    });
  }

  const approvedRelationships = (input.relationships ?? []).filter(record =>
    approvedCharacterIds.has(record.characterAId) && approvedCharacterIds.has(record.characterBId)
  );
  if (approvedCharacters.length >= 2 && approvedRelationships.length === 0) {
    gaps.push({ id: "relationships", message: "Record at least one relationship between approved cast members so the first scene does not invent their dynamic." });
  }

  if (input.requiresHistoricalResearch) {
    const hasSourceBackedResearch = (input.researchTasks ?? []).some(task =>
      task.status === "completed" && Array.isArray(task.sources) && task.sources.length > 0
    );
    if (!hasSourceBackedResearch) {
      gaps.push({ id: "research", message: "Complete at least one source-backed research task before asking for historical accuracy or real-world factual detail." });
    }
  }

  return {
    ready: gaps.length === 0,
    approvedCharacterCount: approvedCharacters.length,
    approvedWorldFactCount: approvedWorldFacts.length,
    approvedRelationshipCount: approvedRelationships.length,
    ...(targetSeriesChapterNumber === undefined ? {} : { targetSeriesChapterNumber }),
    seriesRevision,
    seriesComplete,
    gaps,
  };
}

/**
 * Hold reader-facing story output until the project's world, cast, visual direction, and
 * character continuity are approved. Character profiles/backstories, research, brainstorming,
 * worldbuilding, and design exploration remain available during foundation work.
 */
export function requiresApprovedStoryFoundations(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (!text) return false;
  if (isWholeSeriesPlanningRequest(text)) return false;

  // An explicit deferral is not a request to start production. A later positive clause can
  // still request a different deliverable (e.g. "don't write yet, but plan the opening scene").
  const deferredAction = /\b(?:don't|do\s+not|never|not\s+yet|hold\s+off\s+on|wait\s+to|no\s+need\s+to|let's\s+not)\b[\s\S]{0,80}?\b(?:write|draft|compose|script|generate|produce|continue|illustrate|draw|render|storyboard|start|begin|create|make|outline|plan|show|give|include|add|depict|feature|put)\b/i.exec(text);
  if (deferredAction) {
    const remainder = text.slice(deferredAction.index + deferredAction[0].length);
    const contrastingClause = remainder.match(/\b(?:but|instead|just|actually|rather|however)\b([\s\S]{0,160})/i)?.[1] ?? "";
    if (!/\b(?:write|draft|compose|script|generate|produce|continue|illustrate|draw|render|storyboard|start|begin|create|make|outline|plan|show|give|include|add|depict|feature|put)\b/i.test(contrastingClause)) {
      return false;
    }
  }

  const storyArtifact = /\b(?:chapter|scene|episode|page|panel|storyboard|comic|manga|webtoon|story|storyline|plot\s+beat|story\s+arc|story\s+sequence|sequence|narrative|script|dialogue|dialog|conversation|monologue|narration|prose|paragraph|opening|ending|prologue|epilogue|fight\s+sequence|fight\s+scene|battle\s+scene|character\s+entrance|first\s+meeting|encounter)\b/i.test(text);
  if (!storyArtifact) return false;

  // Foundational documents are part of the preparation phase, not chapter production.
  const foundationDocument = /\b(?:character\s+(?:backstory|profile|biography|bio|description|sheet|model\s+sheet|design\s+sheet)|world\s+(?:bible|rules|history|notes)|lore|timeline|relationship\s+(?:map|history|profile)|setting\s+notes)\b/i.test(text);
  const readerFacingArtifact = /\b(?:chapter|scene|episode|page|panel|storyboard|comic|manga|webtoon|prose|dialogue|dialog|conversation|monologue|narration|paragraph|opening|ending|prologue|epilogue|fight\s+sequence|fight\s+scene|battle\s+scene|character\s+entrance|first\s+meeting|encounter)\b/i.test(text);
  if (foundationDocument && !readerFacingArtifact) return false;

  const explicitOutputAction = /\b(?:write|draft|compose|script|generate|produce|continue|illustrate|draw|render|storyboard|start|begin|create|make|outline|plan)\b/i.test(text);
  const presentArtifactAction = /\b(?:give|show|include|add|depict|feature|put)\b/i.test(text) && readerFacingArtifact;
  const privateResearchOrBrainstorming = /\b(?:research|brainstorm|discuss|explore|ideas?|options?|possibilities|references?|sources?|talk\s+through|think\s+through|explain|compare|analy[sz]e)\b/i.test(text);
  if (!explicitOutputAction && (!presentArtifactAction || privateResearchOrBrainstorming)) return false;

  // We only stop reader-facing production, never private brainstorming or source discovery.
  return true;
}

export function requiresHistoricalResearchForChapter(message: string): boolean {
  return /\b(?:historically accurate|historical accuracy|historically correct|fact[- ]?check(?:ed|ing)?|accurate to (?:the )?(?:real )?history|real[- ]world accuracy|factual accuracy)\b/i.test(message);
}

/** Explicit escape hatch for a knowingly non-canon thumbnail; ordinary chapter requests do not bypass readiness. */
export function requestsProvisionalChapterOverride(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (!text) return false;
  if (/\b(?:don't|do not|not yet|never|let's not)\b[\s\S]{0,80}\b(?:start|begin|write|draw|create|storyboard|override|bypass)\b/i.test(text)) return false;
  return /\b(?:rough|provisional|experimental)\b[\s\S]{0,70}\b(?:storyboard|chapter|scene)\b[\s\S]{0,50}\banyway\b/i.test(text)
    || /\b(?:bypass|override)\b[\s\S]{0,60}\b(?:foundation|readiness|worldbuilding|world-building)\b/i.test(text);
}

export function formatChapterReadinessMessage(report: ChapterReadinessReport): string {
  if (report.ready) return "The chapter foundation check is complete. Kuro can begin the approved storyboard.";
  const details = report.gaps.map((gap, index) => (index + 1) + ". " + gap.message).join("\n");
  if (report.gaps.some(gap => gap.id === "series-sequence")) {
    return "I’m holding this chapter so the approved series stays in order and no earlier drawing is silently skipped.\n\n" +
      details + "\n\nOpen the saved chapter in the Creative Vault, review it, and explicitly approve it in Art Direction before continuing. An already-approved chapter can be revised only when you explicitly ask for a revision.";
  }
  return "I’m holding story production for now. We can keep brainstorming and researching, but Kuro should not start writing dialogue, scenes, or other reader-facing material while approved foundations are missing.\n\nStill needed:\n" + details + "\n\nFinish these in the project's World Bible, Art Direction and whole-series plan, Character Timeline, Style Bible, and relationship records, then ask Kuro to start story production again. For a deliberately non-canon experiment, explicitly request a rough provisional storyboard anyway; that exception should not be treated as approved story canon.";
}
