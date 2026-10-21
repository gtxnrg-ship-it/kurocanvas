export type StyleRecordStatus = "approved" | "proposed" | "superseded";
export type StyleAspect = "relationship-comedy" | "linework" | "rendering" | "palette" | "lighting" | "group-dynamics" | "dialogue" | "proportions" | "other";
export interface StyleInspiration {
  id: string; work: string; aspect: StyleAspect | string; notes: string; status: StyleRecordStatus; sourceUrl?: string;
}
export interface StyleRule { id: string; category: string; rule: string; status: StyleRecordStatus; }
export interface CharacterVisualState {
  id: string; characterName: string; storyOrder: number; chapterLabel: string; chapterNumber?: number;
  age?: string; hair?: string; scars?: string; outfit?: string; body?: string;
  eyes?: string; accessories?: string; injuries?: string; other?: string;
  status: StyleRecordStatus;
}
export interface ProjectStyleBible {
  schemaVersion: 1; projectId: string; title: string; styleSummary: string;
  inspirations: StyleInspiration[]; rules: StyleRule[]; characterStates: CharacterVisualState[];
  updatedAt?: string;
}
export interface StyleConflict { code: "same-time-visual-conflict"; severity: "error" | "warning"; message: string; recordIds: string[]; }

export function createEmptyStyleBible(projectId: string): ProjectStyleBible {
  if (!projectId.trim()) throw new Error("A project ID is required for a style bible.");
  return { schemaVersion: 1, projectId, title: "", styleSummary: "", inspirations: [], rules: [], characterStates: [], updatedAt: new Date(0).toISOString() };
}
export function validateStyleBible(value: unknown, projectId?: string): string[] {
  if (!value || typeof value !== "object") return ["Style bible must be an object."];
  const bible = value as Partial<ProjectStyleBible>, errors: string[] = [];
  if (bible.schemaVersion !== 1) errors.push("Unsupported style bible schema version.");
  if (typeof bible.projectId !== "string" || !bible.projectId.trim()) errors.push("A project ID is required.");
  if (projectId && bible.projectId !== projectId) errors.push("Style bible project ID does not match the active project.");
  if (typeof bible.title !== "string" || typeof bible.styleSummary !== "string") errors.push("Style title and summary must be text.");
  if (!Array.isArray(bible.inspirations) || !Array.isArray(bible.rules) || !Array.isArray(bible.characterStates)) errors.push("Style inspirations, rules, and character states must be lists.");
  for (const item of Array.isArray(bible.inspirations) ? bible.inspirations : []) {
    if (!item || typeof item.id !== "string" || typeof item.work !== "string" || typeof item.aspect !== "string" || typeof item.notes !== "string" || !["approved","proposed","superseded"].includes(item.status)) { errors.push("Every style inspiration needs valid text fields and a status."); continue; }
    if (item.sourceUrl) {
      try { if (new URL(item.sourceUrl).protocol !== "https:") errors.push("Style reference URLs must use HTTPS."); }
      catch { errors.push("Style reference URLs must be valid HTTPS URLs."); }
    }
  }
  for (const item of Array.isArray(bible.rules) ? bible.rules : []) {
    if (!item || typeof item.id !== "string" || typeof item.category !== "string" || typeof item.rule !== "string" || !["approved","proposed","superseded"].includes(item.status)) errors.push("Every style rule needs a category, rule, ID, and status.");
  }
  for (const state of Array.isArray(bible.characterStates) ? bible.characterStates : []) {
    if (!state || typeof state.id !== "string" || typeof state.characterName !== "string" || !state.characterName.trim() || !Number.isFinite(state.storyOrder) || typeof state.chapterLabel !== "string" || (state.chapterNumber !== undefined && (!Number.isFinite(state.chapterNumber) || state.chapterNumber < 0)) || !["approved","proposed","superseded"].includes(state.status)) errors.push("Every character visual state needs a name, finite story order, chapter label, and status.");
  }
  return [...new Set(errors)];
}

const norm = (s: string) => s.normalize("NFKC").toLocaleLowerCase().trim();
const stateSignature = (s: CharacterVisualState) => JSON.stringify([s.age ?? "", s.hair ?? "", s.scars ?? "", s.outfit ?? "", s.body ?? "", s.eyes ?? "", s.accessories ?? "", s.injuries ?? "", s.other ?? ""]);

export type CharacterVisualTraitKey = "age" | "hair" | "scars" | "outfit" | "body" | "eyes" | "accessories" | "injuries" | "other";
export interface ResolvedCharacterVisualState {
  latest: CharacterVisualState;
  traits: Partial<Record<CharacterVisualTraitKey, string>>;
}
/** Resolve approved visual changes chronologically; omitted traits persist, explicit values replace them. */
export function resolveCharacterVisualState(
  states: CharacterVisualState[], characterName: string, targetStoryOrder: number,
): ResolvedCharacterVisualState | undefined {
  const traitKeys: CharacterVisualTraitKey[] = ["age","hair","scars","outfit","body","eyes","accessories","injuries","other"];
  const ordered = states.filter(state => state.status === "approved"
    && norm(state.characterName) === norm(characterName)
    && state.storyOrder <= targetStoryOrder).sort((a,b)=>a.storyOrder-b.storyOrder);
  if (!ordered.length) return undefined;
  const traits: Partial<Record<CharacterVisualTraitKey,string>> = {};
  for (const state of ordered) for (const trait of traitKeys) {
    const value = state[trait];
    if (typeof value === "string" && value.trim()) traits[trait] = value.trim();
  }
  return { latest: ordered[ordered.length - 1], traits };
}
export function findStyleConflicts(bible: ProjectStyleBible): StyleConflict[] {
  const approved = bible.characterStates.filter(s => s.status === "approved");
  const conflicts: StyleConflict[] = [];
  for (let i = 0; i < approved.length; i++) for (let j = i + 1; j < approved.length; j++) {
    const a = approved[i], b = approved[j];
    if (norm(a.characterName) !== norm(b.characterName) || a.storyOrder !== b.storyOrder) continue;
    if (stateSignature(a) !== stateSignature(b)) conflicts.push({
      code: "same-time-visual-conflict", severity: "error",
      message: a.characterName + " has conflicting approved visual states at " + a.chapterLabel + ". Resolve the contradiction before generating artwork.",
      recordIds: [a.id, b.id],
    });
  }
  return conflicts;
}
const statusApproved = <T extends {status: StyleRecordStatus}>(records: T[]) => records.filter(record => record.status === "approved");
function targetOrderFromMessage(text: string): number | undefined {
  const match = text.match(/\b(?:chapter|ch\.?|scene)\s*#?\s*(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}
export function buildStyleBibleContext(
  bible: ProjectStyleBible | undefined, projectId: string, userMessage: string,
  maxCharacters = 6000, targetStoryOrder?: number,
): string {
  if (!bible) return "";
  if (bible.projectId !== projectId) throw new Error("Cannot use a style bible from another project.");
  const errors = validateStyleBible(bible, projectId);
  if (errors.length) throw new Error("Style bible validation failed: " + errors.join(" "));
  const conflicts = findStyleConflicts(bible);
  const requestedOrder = targetStoryOrder ?? targetOrderFromMessage(userMessage);
  const lines = [
    "PROJECT STYLE BIBLE — APPROVED CONTINUITY ONLY",
    "Never drift between chapters. The approved project style summary and approved rules control every panel and character depiction.",
    "Do not silently alter linework, proportions, palette, rendering, hair length/style, age, scars, injuries, outfits, or signature silhouette.",
    "A lasting change carries forward only after its approved story-order introduction. For earlier chapters, never leak future scars, haircuts, injuries, age changes, outfits, or knowledge backward in time.",
    "If no approved visual state covers the requested chapter, state that it is unknown or ask for a reference; do not invent a definitive design.",
    "Inspiration references contribute only their named aspect. Combine broad craft qualities into an original cohesive project identity; do not copy exact characters, designs, panel layouts, compositions, dialogue, or branding.",
  ];
  if (bible.title.trim()) lines.push("Style title: " + bible.title.trim());
  if (bible.styleSummary.trim()) lines.push("Unified original style: " + bible.styleSummary.trim());
  if (conflicts.some(conflict => conflict.severity === "error")) lines.push("GENERATION BLOCK: conflicting approved character visual states exist at the same story order. Do not draw or finalize character designs until the user resolves the contradiction in the Style Bible.");
  for (const inspiration of statusApproved(bible.inspirations)) {
    lines.push(inspiration.aspect + " from " + inspiration.work + (inspiration.notes.trim() ? ": " + inspiration.notes.trim() : ""));
  }
  for (const rule of statusApproved(bible.rules)) lines.push("LOCKED " + rule.category + " rule: " + rule.rule);
  const states = statusApproved(bible.characterStates)
    .filter(state => requestedOrder === undefined || (state.chapterNumber ?? state.storyOrder) <= requestedOrder)
    .sort((a,b) => a.storyOrder-b.storyOrder);
  const traitKeys = ["age", "hair", "scars", "outfit", "body", "eyes", "accessories", "injuries", "other"] as const;
  const resolved = new Map<string, { latest: CharacterVisualState; traits: Partial<Record<(typeof traitKeys)[number], string>> }>();
  for (const state of states) {
    const key = norm(state.characterName);
    const entry = resolved.get(key) ?? { latest: state, traits: {} };
    for (const trait of traitKeys) {
      const value = state[trait];
      // Character states are chronological updates: blank means "unchanged",
      // while an explicit value such as "none" is an intentional change.
      if (typeof value === "string" && value.trim()) entry.traits[trait] = value.trim();
    }
    entry.latest = state;
    resolved.set(key, entry);
  }
  if (requestedOrder !== undefined) lines.push("Target story order: " + requestedOrder + ". Future visual states are forbidden in this request.");
  if (resolved.size) lines.push("RESOLVED APPROVED CHARACTER STATES AT OR BEFORE THE REQUESTED STORY ORDER (unchanged traits persist forward)");
  for (const { latest, traits: resolvedTraits } of resolved.values()) {
    const traits = traitKeys.filter(key => resolvedTraits[key]).map(key => key + ": " + resolvedTraits[key]);
    lines.push("- " + latest.characterName + " (" + latest.chapterLabel + ", order " + latest.storyOrder + "): " + (traits.join("; ") || "No detailed visual traits recorded."));
  }
  const limit = Math.max(500, Math.min(12000, Math.floor(maxCharacters)));
  let context = lines.join("\n");
  if (context.length > limit) context = context.slice(0, limit - 24).trimEnd() + "\n[Style context truncated.]";
  return context;
}
