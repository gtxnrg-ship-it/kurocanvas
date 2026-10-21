/**
 * Durable chapter memory for Kuro Canvas.
 * Chat transcripts are not a reliable canon database. Missing history remains unknown.
 */

const STORY_MEMORY_CAPTURE_PATTERN = /\b(?:remember(?:\s+that)?|chapter|ch\.?|scene|flashback|backstory|character|new\s+character|introduc(?:e|es|ed|ing)|first\s+appearance|reveal(?:s|ed)?|becomes?|became|transform(?:s|ed)?|dies|died|killed|injur(?:ed|y)|betray(?:s|ed|al)|relationship|alliance|event|canon|story\s+vault|visual\s+reference|outfit|appearance|design|power|ability|loses|gains|learns|discovers|meets?|met|born|returns?|vanishes?|disappears?|named|renamed|no\s+longer|is\s+now|has\s+changed|changed\s+from)\b/i;

export function shouldCaptureStoryMemory(text: string): boolean {
  return STORY_MEMORY_CAPTURE_PATTERN.test(text);
}

export type MemorySource = "user" | "approved-chapter" | "imported";
export type MemoryStatus = "approved" | "proposed" | "superseded";
export interface StoryMemoryRecord {
  id: string; projectId: string;
  kind: "chapter" | "event" | "character-change" | "visual-reference" | "panel-template";
  title: string; summary: string;
  chapterNumber?: number; sceneNumber?: number; storyOrder?: number; timelineId?: string; occurredAt?: string;
  entityIds: string[]; tags: string[]; source: MemorySource; status: MemoryStatus;
  assetRefs: string[]; supersedes: string[]; createdAt: string; updatedAt: string;
}
export interface StoryMemoryQuery {
  projectId: string; text?: string; chapterNumber?: number; entityIds?: string[];
  kinds?: StoryMemoryRecord["kind"][]; includeProposed?: boolean; limit?: number; timelineId?: string; maxStoryOrder?: number;
}
export interface StoryMemoryResult { records: StoryMemoryRecord[]; assetRefs: string[]; warnings: string[] }

export interface StoryMemoryTemporalTarget {
  productionRequest: boolean;
  chapterNumber?: number;
  storyOrder?: number;
  timelineId?: string;
}

/**
 * Hard filter for story-writing retrieval. A lexical match never overrides chronology.
 * If the target point is unknown, chronology-bearing records are withheld rather than
 * assuming that unnumbered or future material belongs in the current scene.
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
  return owned.filter(record => {
    const temporal = record.chapterNumber !== undefined || record.storyOrder !== undefined || record.timelineId !== undefined;
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
  return errors;
}
export function retrieveStoryMemory(records: readonly StoryMemoryRecord[], query: StoryMemoryQuery): StoryMemoryResult {
  if (!query.projectId.trim()) throw new Error("Choose a project before searching story memory.");
  const tokens = new Set(tokenize(query.text ?? ""));
  const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 12)));
  const eligible = records.filter(record => record.projectId === query.projectId &&
    (query.includeProposed ? record.status !== "superseded" : record.status === "approved" || query.chapterNumber !== undefined && record.status === "superseded") &&
    (query.chapterNumber === undefined || record.chapterNumber === query.chapterNumber) &&
    (!query.timelineId || record.timelineId === query.timelineId) &&
    (query.maxStoryOrder === undefined || record.storyOrder === undefined || record.storyOrder <= query.maxStoryOrder) &&
    (!query.kinds || query.kinds.includes(record.kind)) &&
    (!query.entityIds?.length || query.entityIds.some(id => record.entityIds.includes(id))));
  const ranked = eligible.map(record => {
    const searchable = tokenize([record.title, record.summary, ...record.tags, ...record.entityIds].join(" "));
    const score = tokens.size ? Array.from(tokens).reduce((sum, token) => sum + (searchable.includes(token) ? 1 : 0), 0) : 1;
    const chapterBoost = query.chapterNumber !== undefined && record.chapterNumber === query.chapterNumber ? 100 : 0;
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
    "Asset references are handles for the app to open; they are not visual evidence by themselves. Never describe an unseen drawing based only on its ID."];
  for (const record of result.records) {
    let chapter = "";
    if (record.chapterNumber !== undefined) chapter = " (chapter " + record.chapterNumber + (record.sceneNumber === undefined ? ")" : ", scene " + record.sceneNumber + ")");
    lines.push("[" + record.status.toUpperCase() + "] " + record.kind + ": " + record.title + chapter);
    lines.push("Summary: " + record.summary);
    if (record.entityIds.length) lines.push("Entities: " + record.entityIds.join(", "));
    if (record.assetRefs.length) lines.push("Reusable asset references: " + record.assetRefs.join(", "));
    if (record.supersedes.length) lines.push("Supersedes/changes records: " + record.supersedes.join(", "));
  }
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
