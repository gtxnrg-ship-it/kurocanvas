export type CanonStatus = "approved" | "proposed" | "inferred" | "contradicted" | "superseded";
export interface CanonEntity { id: string; projectId: string; kind: string; name: string; aliases: string[]; status: CanonStatus }
export interface CanonFact { id: string; projectId: string; subjectId: string; predicate: string; value: unknown; status: CanonStatus; storyOrder?: number; timelineId?: string; dependsOn?: string[]; supersedesFactId?: string }
export interface CanonBundle { schemaVersion: 1; projectId: string; entities: CanonEntity[]; facts: CanonFact[] }
export interface CanonIssue { code: "duplicate-id" | "cross-project-reference" | "missing-reference" | "possible-contradiction" | "invalid-field"; message: string; recordIds: string[]; severity: "warning" | "error" }
export interface CanonQuery { projectId: string; text?: string; kinds?: string[]; entityIds?: string[]; statuses?: CanonStatus[]; maxStoryOrder?: number; timelineId?: string; limit?: number }

const norm = (s: string) => s.normalize("NFKC").toLocaleLowerCase().trim();
const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(x => x.length > 1);
export function createEmptyCanon(projectId: string): CanonBundle {
  if (!projectId.trim()) throw new Error("A project ID is required.");
  return { schemaVersion: 1, projectId, entities: [], facts: [] };
}
export function findCanonContradictions(bundle: CanonBundle): CanonIssue[] {
  const facts = bundle.facts.filter(f => f.status === "approved"), issues: CanonIssue[] = [];
  for (let i = 0; i < facts.length; i++) for (let j = i + 1; j < facts.length; j++) {
    const a = facts[i], b = facts[j];
    if (a.projectId !== b.projectId || a.subjectId !== b.subjectId || norm(a.predicate) !== norm(b.predicate) || a.timelineId !== b.timelineId) continue;
    if (JSON.stringify(a.value) === JSON.stringify(b.value)) continue;
    if (a.storyOrder !== undefined && b.storyOrder !== undefined && a.storyOrder !== b.storyOrder) continue;
    issues.push({ code: "possible-contradiction", message: "Approved facts may conflict for " + a.subjectId + " / " + a.predicate + ".", recordIds: [a.id, b.id], severity: "warning" });
  }
  return issues;
}
export function validateCanon(bundle: CanonBundle): CanonIssue[] {
  const issues: CanonIssue[] = [], ids = new Set<string>();
  for (const r of [...bundle.entities, ...bundle.facts]) {
    if (ids.has(r.id)) issues.push({ code: "duplicate-id", message: "Duplicate canon record ID.", recordIds: [r.id], severity: "error" });
    ids.add(r.id);
    if (r.projectId !== bundle.projectId) issues.push({ code: "cross-project-reference", message: "Record belongs to a different project.", recordIds: [r.id], severity: "error" });
  }
  const entities = new Set(bundle.entities.filter(e => e.projectId === bundle.projectId).map(e => e.id));
  const facts = new Set(bundle.facts.filter(f => f.projectId === bundle.projectId).map(f => f.id));
  for (const f of bundle.facts) {
    if (typeof f.predicate !== "string" || !f.predicate.trim()) {
      issues.push({ code: "invalid-field", message: "Canon fact needs a non-empty predicate.", recordIds: [f.id], severity: "error" });
    }
    if (f.storyOrder !== undefined && (!Number.isFinite(f.storyOrder) || f.storyOrder < 0)) {
      issues.push({ code: "invalid-field", message: "Canon story order must be a non-negative finite number.", recordIds: [f.id], severity: "error" });
    }
    if (f.timelineId !== undefined && (typeof f.timelineId !== "string" || !f.timelineId.trim())) {
      issues.push({ code: "invalid-field", message: "A timeline ID must be a non-empty string when supplied.", recordIds: [f.id], severity: "error" });
    }
    if (!entities.has(f.subjectId)) issues.push({ code: "missing-reference", message: "Fact subject is missing.", recordIds: [f.id, f.subjectId], severity: "error" });
    for (const dep of f.dependsOn ?? []) if (!entities.has(dep) && !facts.has(dep)) issues.push({ code: "missing-reference", message: "Fact dependency is missing.", recordIds: [f.id, dep], severity: "error" });
  }
  return [...issues, ...findCanonContradictions(bundle)];
}
export function retrieveCanon(bundle: CanonBundle, q: CanonQuery) {
  if (q.projectId !== bundle.projectId) throw new Error("Canon retrieval is restricted to the active project.");
  if (q.timelineId !== undefined && !q.timelineId.trim()) throw new Error("Canon retrieval timeline ID cannot be empty.");
  if (q.maxStoryOrder !== undefined && (!Number.isFinite(q.maxStoryOrder) || q.maxStoryOrder < 0)) {
    throw new Error("Canon retrieval story order must be a non-negative finite number.");
  }
  const factEligibleAtPoint = (fact: CanonFact): boolean => {
    if (q.statuses && !q.statuses.includes(fact.status)) return false;
    if (q.maxStoryOrder !== undefined && fact.storyOrder !== undefined && fact.storyOrder > q.maxStoryOrder) return false;
    if (q.timelineId !== undefined) {
      // Facts with explicit timeline ownership must match. Timed facts with no timeline
      // are ambiguous and fail closed; timeless unscoped facts remain world-wide canon.
      if (fact.timelineId !== undefined && fact.timelineId !== q.timelineId) return false;
      if (fact.storyOrder !== undefined && fact.timelineId === undefined) return false;
    }
    return true;
  };
  const limit = Math.max(1, Math.min(500, Math.floor(q.limit ?? 80))), query = new Set(words(q.text ?? ""));
  const matchingFactSubjects = new Map<string, number>();
  if (query.size) {
    for (const fact of bundle.facts) {
      if (fact.projectId !== q.projectId || !factEligibleAtPoint(fact)) continue;
      const haystack = words([fact.predicate, typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value ?? "")].join(" "));
      const score = [...query].filter(token => haystack.includes(token)).length;
      if (score) matchingFactSubjects.set(fact.subjectId, Math.max(matchingFactSubjects.get(fact.subjectId) ?? 0, score));
    }
  }
  const entities = bundle.entities.filter(e => e.projectId === q.projectId && (!q.kinds || q.kinds.includes(e.kind)) && (!q.statuses || q.statuses.includes(e.status)))
    .map(entity => {
      const haystack = words([entity.name, ...entity.aliases].join(" "));
      const entityScore = query.size ? [...query].filter(t => haystack.includes(t)).length * 2 : 1;
      const factScore = matchingFactSubjects.get(entity.id) ?? 0;
      const score = entityScore + factScore + (q.entityIds?.includes(entity.id) ? 1000 : 0);
      return { entity, score };
    }).filter(x => x.score > 0).sort((a,b) => b.score-a.score || a.entity.name.localeCompare(b.entity.name)).slice(0,limit).map(x => x.entity);
  const selected = new Set([...entities.map(e => e.id), ...(q.entityIds ?? [])]);
  const rank: Record<CanonStatus, number> = { approved: 0, proposed: 1, inferred: 2, contradicted: 3, superseded: 4 };
  const facts = bundle.facts.filter(f => f.projectId === q.projectId && selected.has(f.subjectId) && factEligibleAtPoint(f))
    .sort((a,b) => rank[a.status]-rank[b.status] || (b.storyOrder ?? -Infinity)-(a.storyOrder ?? -Infinity)).slice(0,limit);
  return { entities, facts };
}
export function getRetconImpact(bundle: CanonBundle, changedIds: readonly string[]) {
  const entities = new Set(changedIds), facts = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of bundle.facts) if (!facts.has(f.id) && (entities.has(f.subjectId) || changedIds.includes(f.id) || (f.dependsOn ?? []).some(id => entities.has(id) || facts.has(id)))) { facts.add(f.id); changed = true; }
  }
  return { entityIds: [...entities], factIds: [...facts] };
}
export function proposeCanonRevision(current: CanonFact, id: string, value: unknown): CanonFact {
  return { ...current, id, value, status: "proposed", supersedesFactId: current.id };
}
