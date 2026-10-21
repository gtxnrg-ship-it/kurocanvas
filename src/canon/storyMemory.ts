/**
 * Durable chapter memory for Kuro Canvas.
 * Chat transcripts are not a reliable canon database. Missing history remains unknown.
 */

const STORY_MEMORY_CAPTURE_PATTERN = /\b(?:remember(?:\s+that)?|chapter|ch\.?|scene|flashback|backstory|character|new\s+character|introduc(?:e|es|ed|ing)|first\s+appearance|reveal(?:s|ed)?|becomes?|became|transform(?:s|ed)?|dies|died|killed|injur(?:ed|y)|betray(?:s|ed|al)|relationship|alliance|event|canon|story\s+vault|visual\s+reference|outfit|appearance|design|power|ability|loses|gains|learns|discovers|meets?|met|born|returns?|vanishes?|disappears?|named|renamed|no\s+longer|is\s+now|has\s+changed|changed\s+from|easter[-\s]?egg|cameo|foreshadow(?:ing)?|callback|red\s+herring|recurring\s+motif|hidden\s+clue|plant(?:ed|ing)?\s+(?:a\s+)?clue|planned\s+payoff)\b/i;

export function shouldCaptureStoryMemory(text: string): boolean {
  return STORY_MEMORY_CAPTURE_PATTERN.test(text);
}

export type MemorySource = "user" | "approved-chapter" | "imported";
export type MemoryStatus = "approved" | "proposed" | "superseded";
export type StoryThreadType = "foreshadowing" | "easter-egg" | "cameo" | "callback" | "mystery" | "red-herring" | "recurring-motif";
export type StoryThreadAudienceTreatment = "background-only" | "subtle-hint" | "visible-callback" | "explicit-reveal" | "author-only";

/** Author-facing structure for a clue, cameo, motif, mystery, or planned callback. */
export interface StoryThreadPlan {
  type: StoryThreadType;
  audienceTreatment: StoryThreadAudienceTreatment;
  clueDescription: string;
  plannedPayoff: string;
  payoffChapterNumber?: number;
  payoffStoryOrder?: number;
  payoffTimelineId?: string;
  linkedEntityIds: string[];
}
export interface StoryMemoryRecord {
  id: string; projectId: string;
  kind: "chapter" | "event" | "character-change" | "visual-reference" | "panel-template";
  title: string; summary: string;
  chapterNumber?: number; sceneNumber?: number; storyOrder?: number; timelineId?: string; occurredAt?: string;
  entityIds: string[]; tags: string[]; source: MemorySource; status: MemoryStatus; storyThread?: StoryThreadPlan;
  assetRefs: string[]; supersedes: string[]; createdAt: string; updatedAt: string;
}
export interface StoryMemoryQuery {
  projectId: string; text?: string; chapterNumber?: number; entityIds?: string[];
  kinds?: StoryMemoryRecord["kind"][]; includeProposed?: boolean; limit?: number; timelineId?: string; maxStoryOrder?: number;
  /** Add approved earlier-chapter facts as continuity context while keeping exact target-chapter facts highest-ranked. */
  includePriorChapters?: boolean;
}
export interface StoryMemoryResult { records: StoryMemoryRecord[]; assetRefs: string[]; warnings: string[] }

export interface StoryThreadCaptureCandidate {
  type?: string;
  title?: string;
  evidence?: string;
  clueDescription?: string;
  plannedPayoff?: string;
  audienceTreatment?: string;
  plantChapterNumber?: number;
  plantStoryOrder?: number;
  plantTimelineId?: string;
  payoffChapterNumber?: number;
  payoffStoryOrder?: number;
  payoffTimelineId?: string;
  linkedEntities?: string[];
}

/**
 * Convert a model-extracted clue into a reviewable proposal, not approved canon.
 * Metadata coordinates are accepted only when the exact evidence also contains
 * a corresponding explicit chapter/order/timeline reference.
 */
export function createStoryThreadProposal(
  candidate: StoryThreadCaptureCandidate,
  userText: string,
  projectId: string,
  now = new Date().toISOString(),
  idFactory: () => string = () => crypto.randomUUID(),
): StoryMemoryRecord | undefined {
  if (!projectId.trim()) return undefined;
  const evidence = typeof candidate.evidence === "string" ? candidate.evidence.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim().slice(0, 180) : "";
  const clueDescription = typeof candidate.clueDescription === "string" ? candidate.clueDescription.trim().slice(0, 1600) : "";
  const plannedPayoff = typeof candidate.plannedPayoff === "string" ? candidate.plannedPayoff.trim().slice(0, 1600) : "";
  const types: StoryThreadType[] = ["foreshadowing", "easter-egg", "cameo", "callback", "mystery", "red-herring", "recurring-motif"];
  const treatments: StoryThreadAudienceTreatment[] = ["background-only", "subtle-hint", "visible-callback", "explicit-reveal", "author-only"];
  if (!evidence || !userText.includes(evidence) || !title || !clueDescription || !plannedPayoff) return undefined;
  if (!types.includes(candidate.type as StoryThreadType) || !treatments.includes(candidate.audienceTreatment as StoryThreadAudienceTreatment)) return undefined;

  const chapters = [...evidence.matchAll(/\b(?:chapter|ch\.?)\s*#?\s*(\d+)\b/gi)].map(match => Number(match[1]));
  const orders = [...evidence.matchAll(/\b(?:story\s+order|storyOrder)\s*[:#]?\s*(\d+)\b/gi)].map(match => Number(match[1]));
  const timelines = [...evidence.matchAll(/\b(?:plant|payoff)?\s*timeline(?:\s+id)?\s*[:#]?\s*([A-Za-z0-9_-]+)\b/gi)].map(match => match[1]);
  const verifiedChapter = (value: unknown) => Number.isInteger(value) && chapters.includes(Number(value)) ? Number(value) : undefined;
  const verifiedOrder = (value: unknown) => Number.isFinite(value) && orders.includes(Number(value)) ? Number(value) : undefined;
  const verifiedTimeline = (value: unknown) => typeof value === "string" && timelines.includes(value) ? value : undefined;
  const chapterNumber = verifiedChapter(candidate.plantChapterNumber);
  const storyOrder = verifiedOrder(candidate.plantStoryOrder);
  const timelineId = verifiedTimeline(candidate.plantTimelineId);
  const payoffChapterNumber = verifiedChapter(candidate.payoffChapterNumber);
  const payoffStoryOrder = verifiedOrder(candidate.payoffStoryOrder);
  const payoffTimelineId = verifiedTimeline(candidate.payoffTimelineId);
  const threadType = candidate.type as StoryThreadType;
  const audienceTreatment = candidate.audienceTreatment as StoryThreadAudienceTreatment;
  const linkedEntityIds = (Array.isArray(candidate.linkedEntities) ? candidate.linkedEntities : [])
    .filter((name): name is string => typeof name === "string" && !!name.trim() && evidence.toLocaleLowerCase().includes(name.toLocaleLowerCase()))
    .slice(0, 12)
    .map(name => name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, ""));
  const record: StoryMemoryRecord = {
    id: idFactory(), projectId, kind: "event", title, summary: evidence,
    ...(chapterNumber === undefined ? {} : { chapterNumber }),
    ...(storyOrder === undefined ? {} : { storyOrder }),
    ...(timelineId ? { timelineId } : {}),
    entityIds: linkedEntityIds, tags: ["narrative-thread", threadType, audienceTreatment],
    source: "user", status: "proposed", assetRefs: [], supersedes: [],
    storyThread: {
      type: threadType,
      audienceTreatment,
      clueDescription, plannedPayoff,
      ...(payoffChapterNumber === undefined ? {} : { payoffChapterNumber }),
      ...(payoffStoryOrder === undefined ? {} : { payoffStoryOrder }),
      ...(payoffTimelineId ? { payoffTimelineId } : {}),
      linkedEntityIds,
    },
    createdAt: now, updatedAt: now,
  };
  return validateStoryMemoryRecord(record, projectId).length ? undefined : record;
}

export interface StoryMemoryTemporalTarget {
  productionRequest: boolean;
  chapterNumber?: number;
  storyOrder?: number;
  timelineId?: string;
  /** The author explicitly requested a future clue/cameo and needs its planned payoff as context. */
  allowAuthorDirectedForeshadowing?: boolean;
}

/**
 * Sequential production normally limits memory to the target story point.
 * An explicit author request for an Easter egg/cameo may use future memory as
 * planning knowledge, but only within the selected timeline. This is not a ban
 * on writing future material; it is context selection for the requested scene.
 */
export function filterStoryMemoryAtPoint(
  records: readonly StoryMemoryRecord[],
  projectId: string,
  target: StoryMemoryTemporalTarget,
): StoryMemoryRecord[] {
  const owned = records.filter(record => record.projectId === projectId);
  if (!target.productionRequest) return owned;
  const chapter = target.chapterNumber;
  const order = target.storyOrder;
  if (chapter === undefined && order === undefined) return [];
  if (chapter !== undefined && (!Number.isInteger(chapter) || chapter < 0)) {
    throw new Error("Target chapter must be a non-negative integer.");
  }
  if (order !== undefined && (!Number.isFinite(order) || order < 0)) {
    throw new Error("Target story order must be non-negative and finite.");
  }
  if (target.timelineId !== undefined && !target.timelineId.trim()) throw new Error("Target timeline ID cannot be empty.");
  if (target.allowAuthorDirectedForeshadowing) {
    // Future events can inform an intentional early clue, but facts from a parallel
    // timeline and unscoped time-bound records must not silently contaminate it.
    return owned.filter(record => {
      const timeless = record.chapterNumber === undefined && record.sceneNumber === undefined
        && record.storyOrder === undefined && record.timelineId === undefined && record.storyThread === undefined;
      if (timeless) return true;
      if (!target.timelineId) return false;
      return record.timelineId === target.timelineId;
    });
  }
  return owned.filter(record => {
    const temporal = record.chapterNumber !== undefined || record.sceneNumber !== undefined || record.storyOrder !== undefined || record.timelineId !== undefined;
    // If the target timeline is ambiguous, only genuinely timeless global notes survive.
    if (temporal && (!target.timelineId || record.timelineId !== target.timelineId)) return false;
    if (chapter !== undefined && record.chapterNumber !== undefined && record.chapterNumber > chapter) return false;
    if (chapter !== undefined && temporal && record.chapterNumber === undefined && order === undefined) return false;
    if (order !== undefined && record.storyOrder !== undefined && record.storyOrder > order) return false;
    if (order !== undefined && temporal && record.storyOrder === undefined) {
      // A record from a strictly earlier numbered chapter is chronologically safe;
      // same-chapter memories without story order remain ambiguous and are withheld.
      if (chapter === undefined || record.chapterNumber === undefined || record.chapterNumber >= chapter) return false;
    }
    return true;
  });
}
const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase().trim();
const tokenize = (s: string) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 1);
export function validateStoryMemoryRecord(record: StoryMemoryRecord, projectId: string): string[] {
  const errors: string[] = [];
  if (!record.id.trim()) errors.push("Memory record needs a stable ID.");
  if (!projectId.trim() || record.projectId !== projectId) errors.push("Memory belongs to a different project.");
  if (!record.title.trim()) errors.push("Memory record needs a title.");
  if (!record.summary.trim()) errors.push("Memory record needs a summary of what is known.");
  if (record.chapterNumber !== undefined && (!Number.isInteger(record.chapterNumber) || record.chapterNumber < 0)) errors.push("Chapter number must be a non-negative integer.");
  if (record.sceneNumber !== undefined && (!Number.isInteger(record.sceneNumber) || record.sceneNumber < 0)) errors.push("Scene number must be a non-negative integer.");
  if (record.storyOrder !== undefined && (!Number.isFinite(record.storyOrder) || record.storyOrder < 0)) errors.push("Story order must be a non-negative finite number.");
  if (record.timelineId !== undefined && (typeof record.timelineId !== "string" || !record.timelineId.trim())) errors.push("Timeline ID must be a non-empty string when supplied.");
  if (!Array.isArray(record.entityIds) || !Array.isArray(record.tags) || !Array.isArray(record.assetRefs) || !Array.isArray(record.supersedes)) errors.push("Memory links and tags must be arrays.");
  if (record.storyThread !== undefined) {
    const thread = record.storyThread;
    const threadTypes: StoryThreadType[] = ["foreshadowing", "easter-egg", "cameo", "callback", "mystery", "red-herring", "recurring-motif"];
    const audienceTreatments: StoryThreadAudienceTreatment[] = ["background-only", "subtle-hint", "visible-callback", "explicit-reveal", "author-only"];
    if (!thread || typeof thread !== "object" || !threadTypes.includes(thread.type) || !audienceTreatments.includes(thread.audienceTreatment)) {
      errors.push("Narrative thread needs a supported type and reader-facing treatment.");
    } else {
      if (typeof thread.clueDescription !== "string" || !thread.clueDescription.trim()) errors.push("Narrative thread needs a concrete clue description.");
      if (typeof thread.plannedPayoff !== "string" || !thread.plannedPayoff.trim()) errors.push("Narrative thread needs an intended payoff or an explicit unknown value.");
      if (!Array.isArray(thread.linkedEntityIds) || thread.linkedEntityIds.some(id => typeof id !== "string")) errors.push("Narrative thread linked entities must be a list of strings.");
      if (thread.payoffChapterNumber !== undefined && (!Number.isInteger(thread.payoffChapterNumber) || thread.payoffChapterNumber < 0)) errors.push("Narrative thread payoff chapter must be a non-negative integer.");
      if (thread.payoffStoryOrder !== undefined && (!Number.isFinite(thread.payoffStoryOrder) || thread.payoffStoryOrder < 0)) errors.push("Narrative thread payoff story order must be non-negative and finite.");
      if (thread.payoffTimelineId !== undefined && (typeof thread.payoffTimelineId !== "string" || !thread.payoffTimelineId.trim())) errors.push("Narrative thread payoff timeline must be a non-empty string when supplied.");
    }
  }
  return errors;
}
/**
 * Approval requires an explicit timeline for chronology-bearing notes.
 * Legacy records can still be loaded and edited, but must be scoped before
 * a proposal becomes canon. Retrieval remains independently fail-closed.
 */
export function validateStoryMemoryForApproval(record: StoryMemoryRecord, projectId: string): string[] {
  const errors = validateStoryMemoryRecord(record, projectId);
  const timeBound = record.chapterNumber !== undefined || record.sceneNumber !== undefined
    || record.storyOrder !== undefined || record.timelineId !== undefined || record.storyThread !== undefined;
  if (timeBound && !record.timelineId?.trim()) {
    errors.push("Time-bound memories need a timeline ID before approval.");
  }
  return errors;
}

export function retrieveStoryMemory(records: readonly StoryMemoryRecord[], query: StoryMemoryQuery): StoryMemoryResult {
  if (!query.projectId.trim()) throw new Error("Choose a project before searching story memory.");
  const tokens = new Set(tokenize(query.text ?? ""));
  const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 12)));
  const eligible = records.filter(record => record.projectId === query.projectId &&
    (query.includeProposed ? record.status !== "superseded" : record.status === "approved" || query.chapterNumber !== undefined && record.status === "superseded") &&
    (query.chapterNumber === undefined || record.chapterNumber === query.chapterNumber ||
      query.includePriorChapters === true && (
        record.chapterNumber !== undefined && record.chapterNumber < query.chapterNumber ||
        record.chapterNumber === undefined && record.sceneNumber === undefined && record.storyOrder === undefined && record.timelineId === undefined
      )) &&
    (!query.timelineId || record.timelineId === query.timelineId) &&
    (query.maxStoryOrder === undefined || record.storyOrder === undefined || record.storyOrder <= query.maxStoryOrder) &&
    (!query.kinds || query.kinds.includes(record.kind)) &&
    (!query.entityIds?.length || query.entityIds.some(id => record.entityIds.includes(id))));
  const ranked = eligible.map(record => {
    const threadSearch = record.storyThread ? [
      record.storyThread.type, record.storyThread.audienceTreatment, record.storyThread.clueDescription,
      record.storyThread.plannedPayoff, ...record.storyThread.linkedEntityIds,
    ] : [];
    const searchable = tokenize([record.title, record.summary, ...record.tags, ...record.entityIds, ...threadSearch].join(" "));
    const score = tokens.size ? Array.from(tokens).reduce((sum, token) => sum + (searchable.includes(token) ? 1 : 0), 0) : 1;
    const chapterBoost = query.chapterNumber !== undefined && record.chapterNumber === query.chapterNumber ? 300
      : query.includePriorChapters && query.chapterNumber !== undefined && record.chapterNumber !== undefined
        ? Math.max(0, 40 - (query.chapterNumber - record.chapterNumber)) : 0;
    const entityBoost = query.entityIds?.some(id => record.entityIds.includes(id)) ? 20 : 0;
    return { record, score: score + chapterBoost + entityBoost };
  }).filter(item => item.score > 0)
    .sort((a,b) => b.score-a.score || (b.record.storyOrder ?? -1)-(a.record.storyOrder ?? -1) || b.record.updatedAt.localeCompare(a.record.updatedAt))
    .slice(0, limit);
  const found = ranked.map(item => item.record);
  const assetRefs = Array.from(new Set(found.flatMap(record => record.assetRefs)));
  const warnings: string[] = [];
  if (!found.some(record => record.status === "approved")) warnings.push("No matching approved story memory was found. Superseded or proposed records do not establish current chapter canon. Do not invent the event, dialogue, character state, or panel layout; ask for approved source material.");
  if (query.chapterNumber !== undefined && !found.some(record => record.chapterNumber === query.chapterNumber && record.status === "approved")) warnings.push("The requested chapter has no matching approved memory. A superseded version is historical only and must not be treated as the current account.");
  if (found.some(record => record.status === "proposed")) warnings.push("Some results are proposals, not approved story history. Never present them as facts or let them override approved canon.");
  if (found.some(record => record.status === "superseded")) warnings.push("Some results are superseded historical revisions. Do not use them as active continuity or overrule approved records. Reconstruct an old version only when the user explicitly asks about that version.");
  return { records: found, assetRefs, warnings };
}
export function buildStoryMemoryContext(result: StoryMemoryResult, maxCharacters = 6000): string {
  const cap = Math.max(500, Math.min(16000, Math.floor(maxCharacters)));
  const lines = ["KURO CANVAS — RETRIEVED STORY MEMORY",
    "Approval status is binding: APPROVED records are established canon; PROPOSED records are unapproved suggestions; SUPERSEDED records are old revisions, not active canon.",
    "Use approved records for current continuity. A proposed or superseded record must never override, silently retcon, or be presented as established fact.",
    "Use a superseded record only when the user explicitly asks to reconstruct that old version; clearly identify it as superseded and distinguish it from current approved history.",
    "Keep chapter order, character state, who knows what, and referenced visual assets consistent. Missing or conflicting evidence means unknown, not permission to invent.",
    "NARRATIVE THREADS are author-facing continuity plans. Their intended future payoff is not automatically dialogue, narration, or visible chapter content. Before the payoff, show only the approved clue treatment; preserve the mystery unless the author explicitly requests a reveal or full-series outline.",
    "Asset references are handles for the app to open; they are not visual evidence by themselves. Never describe an unseen drawing based only on its ID."];
  for (const record of result.records) {
    let chapter = "";
    if (record.chapterNumber !== undefined) chapter = " (chapter " + record.chapterNumber + (record.sceneNumber === undefined ? ")" : ", scene " + record.sceneNumber + ")");
    const timeline = record.timelineId ? " · timeline " + record.timelineId : "";
    const order = record.storyOrder === undefined ? "" : " · story order " + record.storyOrder;
    lines.push("[" + record.status.toUpperCase() + "] " + record.kind + ": " + record.title + chapter + timeline + order);
    lines.push("Summary: " + record.summary);
    if (record.entityIds.length) lines.push("Entities: " + record.entityIds.join(", "));
    if (record.assetRefs.length) lines.push("Reusable asset references: " + record.assetRefs.join(", "));
    if (record.supersedes.length) lines.push("Supersedes/changes records: " + record.supersedes.join(", "));
    if (record.storyThread) {
      const thread = record.storyThread;
      lines.push("AUTHOR-ONLY STORY THREAD: " + thread.type + " · reader treatment: " + thread.audienceTreatment);
      lines.push("Intended visible clue/plant: " + thread.clueDescription);
      lines.push("Planned payoff (not for early on-page disclosure): " + thread.plannedPayoff);
      if (thread.payoffChapterNumber !== undefined) lines.push("Planned payoff chapter: " + thread.payoffChapterNumber);
      if (thread.payoffStoryOrder !== undefined) lines.push("Planned payoff story order: " + thread.payoffStoryOrder);
      if (thread.payoffTimelineId) lines.push("Payoff timeline: " + thread.payoffTimelineId);
      if (thread.linkedEntityIds.length) lines.push("Linked story entities: " + thread.linkedEntityIds.join(", "));
    }
  }
  const timelines = [...new Set(result.records.map(record => record.timelineId).filter((value): value is string => !!value))];
  if (timelines.length > 1) lines.push("TIMELINE SEPARATION WARNING: These results include multiple timelines (" + timelines.join(", ") + "). Keep each timeline's events separate; do not combine mutually exclusive facts. State which version applies when the user has not selected one.");
  for (const warning of result.warnings) lines.push("CONTINUITY WARNING: " + warning);
  const output = lines.join("\n");
  return output.length > cap ? output.slice(0, cap - 32).trimEnd() + "\n[Memory context truncated.]" : output;
}
export function proposeChapterMemory(input: Omit<StoryMemoryRecord, "kind" | "status" | "source" | "createdAt" | "updatedAt">, now = new Date().toISOString()): StoryMemoryRecord {
  const record: StoryMemoryRecord = { ...input, kind: "chapter", status: "proposed", source: "user", createdAt: now, updatedAt: now };
  const errors = validateStoryMemoryRecord(record, input.projectId);
  if (errors.length) throw new Error("Cannot create chapter memory: " + errors.join(" "));
  return record;
}
