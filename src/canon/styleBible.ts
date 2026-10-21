export type StyleRecordStatus = "proposed" | "approved" | "superseded";
export type InspirationAspect = "relationship-comedy" | "linework" | "color" | "character-design" | "group-dynamics" | "pacing" | "lighting" | "composition" | "other";

export interface StyleInspiration {
  id: string;
  work: string;
  aspect: InspirationAspect;
  notes: string;
  sourceUrl?: string;
  status: StyleRecordStatus;
}
export interface StyleRule {
  id: string;
  category: "linework" | "palette" | "lighting" | "anatomy" | "rendering" | "composition" | "continuity" | "avoid";
  rule: string;
  status: StyleRecordStatus;
}
export interface CharacterVisualState {
  id: string;
  characterName: string;
  storyOrder: number;
  chapterLabel?: string;
  age?: string;
  hair?: string;
  eyes?: string;
  face?: string;
  outfit?: string;
  body?: string;
  scars?: string;
  accessories?: string;
  expressionNotes?: string;
  status: StyleRecordStatus;
  supersedes?: string;
}
export interface ProjectStyleBible {
  schemaVersion: 1;
  projectId: string;
  title: string;
  styleSummary: string;
  styleSummaryStatus: StyleRecordStatus;
  inspirations: StyleInspiration[];
  rules: StyleRule[];
  characterStates: CharacterVisualState[];
  approvedVersion: number;
  updatedAt: string;
}
export interface StyleConflict {
  code: "duplicate-id" | "missing-required-style" | "same-time-visual-conflict" | "unapproved-reference";
  message: string;
  recordIds: string[];
  severity: "warning" | "error";
}
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
const idSet = (records: Array<{id:string}>) => new Set(records.map(record=>record.id));

export function createEmptyStyleBible(projectId: string): ProjectStyleBible {
  if (!projectId.trim()) throw new Error("A project ID is required to create a style bible.");
  return { schemaVersion: 1, projectId, title: "Project Style Bible", styleSummary: "", styleSummaryStatus: "proposed", inspirations: [], rules: [], characterStates: [], approvedVersion: 0, updatedAt: new Date().toISOString() };
}

export function validateStyleBible(bible: ProjectStyleBible, expectedProjectId?: string): string[] {
  const errors: string[] = [];
  if (bible.schemaVersion !== 1) errors.push("Unsupported style bible schema.");
  if (!bible.projectId.trim() || (expectedProjectId && bible.projectId !== expectedProjectId)) errors.push("Style bible project does not match the active project.");
  if (!Array.isArray(bible.inspirations) || !Array.isArray(bible.rules) || !Array.isArray(bible.characterStates)) errors.push("Style bible collections must be lists.");
  const records = [...(bible.inspirations ?? []), ...(bible.rules ?? []), ...(bible.characterStates ?? [])];
  const ids = new Set<string>();
  for (const record of records) {
    if (!record.id?.trim()) errors.push("Every style record needs an ID.");
    else if (ids.has(record.id)) errors.push("Duplicate style record ID: " + record.id);
    ids.add(record.id);
  }
  for (const source of bible.inspirations ?? []) {
    if (!source.work.trim() || !source.notes.trim()) errors.push("Every inspiration needs a work name and an aspect-specific note.");
    if (source.sourceUrl && !/^https:\/\//i.test(source.sourceUrl)) errors.push("Reference URLs must use HTTPS.");
  }
  for (const rule of bible.rules ?? []) if (!rule.rule.trim()) errors.push("Style rules cannot be empty.");
  for (const state of bible.characterStates ?? []) {
    if (!state.characterName.trim() || !Number.isFinite(state.storyOrder)) errors.push("Character visual states need a name and numeric story order.");
  }
  return errors;
}

export function findStyleConflicts(bible: ProjectStyleBible): StyleConflict[] {
  const issues: StyleConflict[] = [];
  const approved = bible.characterStates.filter(state => state.status === "approved");
  const fields: Array<keyof CharacterVisualState> = ["age","hair","eyes","face","outfit","body","scars","accessories"];
  for (let i = 0; i < approved.length; i++) for (let j = i + 1; j < approved.length; j++) {
    const a = approved[i], b = approved[j];
    if (normalize(a.characterName) !== normalize(b.characterName) || a.storyOrder !== b.storyOrder) continue;
    for (const field of fields) {
      const av = a[field], bv = b[field];
      if (typeof av === "string" && typeof bv === "string" && normalize(av) && normalize(bv) && normalize(av) !== normalize(bv)) {
        issues.push({ code: "same-time-visual-conflict", message: a.characterName + " has conflicting approved " + field + " values at story order " + a.storyOrder + ".", recordIds: [a.id,b.id], severity: "error" });
      }
    }
  }
  for (const source of bible.inspirations) if (source.status !== "approved") {
    issues.push({ code: "unapproved-reference", message: "Inspiration " + source.work + " is not approved; do not treat it as a locked style direction.", recordIds: [source.id], severity: "warning" });
  }
  if (!bible.rules.some(rule => rule.status === "approved")) {
    issues.push({ code: "missing-required-style", message: "No approved style rules yet. Visual consistency cannot be guaranteed until the style bible is approved.", recordIds: [], severity: "warning" });
  }
  return issues;
}

/** Builds a strict, bounded prompt contract. Unapproved proposals are never silently promoted to project truth. */
export function buildStyleBibleContext(bible: ProjectStyleBible | undefined, projectId: string, userMessage: string, maxCharacters = 5200): string {
  if (!bible) return "";
  if (!projectId.trim() || bible.projectId !== projectId) throw new Error("Style context refused: style bible belongs to another project.");
  const cap = Math.max(500, Math.min(9000, Math.floor(maxCharacters)));
  const approvedRules = bible.rules.filter(rule => rule.status === "approved");
  const approvedInspirations = bible.inspirations.filter(source => source.status === "approved");
  const names = [...new Set(bible.characterStates.filter(s=>s.status==="approved").map(s=>s.characterName))];
  const relevantNames = names.filter(name => normalize(userMessage).includes(normalize(name)));
  const chosenStates = bible.characterStates.filter(s => s.status === "approved" && (!relevantNames.length || relevantNames.some(n=>normalize(n)===normalize(s.characterName))))
    .sort((a,b)=>a.storyOrder-b.storyOrder);
  const lines = [
    "PROJECT STYLE BIBLE — CONTINUITY CONTRACT",
    "Create an original, cohesive project style. References are separated by aspect; do not reproduce any referenced work panel-for-panel or copy its exact character designs.",
    "Never drift between chapters. Keep approved linework, palette, proportions, rendering, and composition rules stable unless an explicit approved style revision says otherwise.",
    "Character appearances are temporal: use the state matching the requested chapter/story order. Preserve established scars, injuries, aging, hair changes, clothing changes, and accessories after they occur. Do not add a future change to an earlier chapter.",
    "If the required style or character state is absent, mark it unknown and ask for clarification rather than inventing it. Proposals are not canon.",
    bible.title + ": " + (bible.styleSummaryStatus === "approved" && bible.styleSummary.trim() ? bible.styleSummary : "No approved style summary yet.")
  ];
  if (approvedInspirations.length) {
    lines.push("APPROVED INSPIRATION BY ASPECT (use as high-level direction, not imitation):");
    for (const source of approvedInspirations) lines.push("- " + source.aspect + " from " + source.work + ": " + source.notes);
  }
  if (approvedRules.length) {
    lines.push("LOCKED STYLE RULES:");
    for (const rule of approvedRules) lines.push("- [" + rule.category + "] " + rule.rule);
  }
  if (chosenStates.length) {
    lines.push("APPROVED TEMPORAL CHARACTER VISUAL STATES (oldest first; select only the state appropriate to requested story order):");
    for (const state of chosenStates) {
      const attrs = (["age","hair","eyes","face","outfit","body","scars","accessories","expressionNotes"] as const)
        .filter(key=>state[key]?.trim()).map(key=>key + "=" + state[key]);
      lines.push("- " + state.characterName + " @ order " + state.storyOrder + (state.chapterLabel ? " ("+state.chapterLabel+")" : "") + ": " + attrs.join("; "));
    }
  }
  let result = lines.join("\n");
  if (result.length > cap) result = result.slice(0, cap - 24).trimEnd() + "\n[Style context truncated.]";
  return result;
}

/** Merge inspirations into aspect buckets without discarding where each direction came from. */
export function groupInspirationsByAspect(sources: StyleInspiration[]): Partial<Record<InspirationAspect, StyleInspiration[]>> {
  return sources.reduce((groups, source) => {
    (groups[source.aspect] ??= []).push(source);
    return groups;
  }, {} as Partial<Record<InspirationAspect, StyleInspiration[]>>);
}
