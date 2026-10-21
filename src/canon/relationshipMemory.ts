/** Temporal, evidence-linked relationship canon. Proposed events never mutate approved history. */
export type RelationshipState = "strangers" | "acquaintances" | "allies" | "friends" | "close-friends" | "rivals" | "enemies" | "estranged" | "romantic" | "family" | "custom";
export type RelationshipCanonStatus = "approved" | "proposed" | "superseded";

export interface RelationshipSnapshot {
  state: RelationshipState;
  customState?: string;
  trust: number;
  warmth: number;
  tension: number;
  emotionalNotes: string[];
  interactionPattern: string[];
  boundaries: string[];
  unresolvedWounds: string[];
}
export interface RelationshipEvent {
  id: string;
  universeId: string;
  relationshipId: string;
  storyOrder: number;
  occurredAt: string;
  title: string;
  summary: string;
  cause: string;
  consequences: string[];
  sourceMessageIds: string[];
  canonStatus: RelationshipCanonStatus;
  before: RelationshipSnapshot;
  after: RelationshipSnapshot;
}
export interface RelationshipRecord {
  schemaVersion: 1;
  id: string;
  universeId: string;
  characterAId: string;
  characterBId: string;
  directional: boolean;
  current: RelationshipSnapshot;
  history: RelationshipEvent[];
  updatedAt: string;
}
export interface RelationshipTransitionProposal {
  title: string;
  summary: string;
  cause: string;
  consequences?: string[];
  sourceMessageIds: string[];
  storyOrder: number;
  after: RelationshipSnapshot;
  occurredAt?: string;
  id?: string;
}

const STATES: readonly RelationshipState[] = ["strangers","acquaintances","allies","friends","close-friends","rivals","enemies","estranged","romantic","family","custom"];
const STATUSES: readonly RelationshipCanonStatus[] = ["approved","proposed","superseded"];
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const snapshotValid = (value: unknown): value is RelationshipSnapshot => {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<RelationshipSnapshot>;
  return STATES.includes(s.state as RelationshipState)
    && (s.customState === undefined || typeof s.customState === "string")
    && [s.trust,s.warmth,s.tension].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100)
    && strings(s.emotionalNotes) && strings(s.interactionPattern) && strings(s.boundaries) && strings(s.unresolvedWounds)
    && (s.state !== "custom" || !!s.customState?.trim());
};

export function validateRelationshipRecord(value: unknown, expectedUniverseId?: string): value is RelationshipRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<RelationshipRecord>;
  if (r.schemaVersion !== 1 || typeof r.id !== "string" || !r.id.trim()
    || typeof r.universeId !== "string" || !r.universeId.trim()
    || (expectedUniverseId !== undefined && r.universeId !== expectedUniverseId)
    || typeof r.characterAId !== "string" || !r.characterAId.trim()
    || typeof r.characterBId !== "string" || !r.characterBId.trim()
    || r.characterAId === r.characterBId || typeof r.directional !== "boolean"
    || !snapshotValid(r.current) || !Array.isArray(r.history) || typeof r.updatedAt !== "string") return false;
  let previousOrder = -Infinity;
  const ids = new Set<string>();
  for (const event of r.history) {
    if (!event || typeof event !== "object" || typeof event.id !== "string" || !event.id.trim() || ids.has(event.id)
      || event.universeId !== r.universeId || event.relationshipId !== r.id
      || !Number.isFinite(event.storyOrder) || event.storyOrder <= previousOrder
      || typeof event.occurredAt !== "string" || typeof event.title !== "string" || !event.title.trim()
      || typeof event.summary !== "string" || !event.summary.trim() || typeof event.cause !== "string"
      || !strings(event.consequences) || !strings(event.sourceMessageIds)
      || !STATUSES.includes(event.canonStatus) || !snapshotValid(event.before) || !snapshotValid(event.after)) return false;
    ids.add(event.id); previousOrder = event.storyOrder;
  }
  return true;
}

/** Returns the latest approved state at the requested story time; never treats a proposal as canon. */
export function relationshipAt(record: RelationshipRecord, storyOrder?: number): RelationshipSnapshot | undefined {
  if (!validateRelationshipRecord(record)) return undefined;
  const eligible = record.history.filter(event => event.canonStatus === "approved" && (storyOrder === undefined || event.storyOrder <= storyOrder));
  if (!eligible.length) return storyOrder === undefined ? record.current : undefined;
  return structuredClone(eligible[eligible.length - 1].after);
}

/** Create a proposal only. The caller must separately approve and append the event. */
export function proposeRelationshipTransition(
  record: RelationshipRecord,
  input: RelationshipTransitionProposal,
  idFactory: () => string = () => crypto.randomUUID(),
): RelationshipEvent {
  if (!validateRelationshipRecord(record)) throw new Error("Cannot propose a transition from an invalid relationship record.");
  const lastOrder = record.history.reduce((max, event) => Math.max(max, event.storyOrder), -Infinity);
  if (!Number.isFinite(input.storyOrder) || input.storyOrder <= lastOrder) throw new Error("Relationship story order must be later than existing history.");
  if (!input.title.trim() || !input.summary.trim() || !input.sourceMessageIds.length) {
    throw new Error("A relationship proposal needs a title, summary, and source-message evidence.");
  }
  if (!snapshotValid(input.after)) throw new Error("The proposed relationship state is invalid.");
  return {
    id: input.id ?? idFactory(),
    universeId: record.universeId,
    relationshipId: record.id,
    storyOrder: input.storyOrder,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    cause: input.cause.trim(),
    consequences: [...(input.consequences ?? [])],
    sourceMessageIds: [...input.sourceMessageIds],
    canonStatus: "proposed",
    before: structuredClone(record.current),
    after: structuredClone(input.after),
  };
}

/** Build only universe-scoped context; empty evidence is explicitly reported, never filled by invention. */
export function buildRelationshipContext(
  records: readonly RelationshipRecord[],
  universeId: string,
  storyOrder?: number,
): string {
  if (!universeId.trim()) throw new Error("Choose a universe before retrieving relationship context.");
  const scoped = records.filter(record => validateRelationshipRecord(record, universeId));
  if (!scoped.length) return "RELATIONSHIP MEMORY: No approved relationship records exist in this universe. Do not invent relationship history; ask for evidence when needed.";
  const lines = ["RELATIONSHIP MEMORY (universe-scoped; proposals are not canon):"];
  for (const record of scoped) {
    const snapshot = relationshipAt(record, storyOrder);
    if (!snapshot) continue;
    lines.push(`- ${record.characterAId} ↔ ${record.characterBId}: ${snapshot.state}${snapshot.customState ? " ("+snapshot.customState+")" : ""}; trust ${snapshot.trust}/100; warmth ${snapshot.warmth}/100; tension ${snapshot.tension}/100.`);
    if (snapshot.emotionalNotes.length) lines.push("  Emotional context: "+snapshot.emotionalNotes.join("; "));
    if (snapshot.interactionPattern.length) lines.push("  Interaction patterns: "+snapshot.interactionPattern.join("; "));
    if (snapshot.boundaries.length) lines.push("  Boundaries: "+snapshot.boundaries.join("; "));
    if (snapshot.unresolvedWounds.length) lines.push("  Unresolved wounds: "+snapshot.unresolvedWounds.join("; "));
    const events = record.history.filter(event => event.canonStatus === "approved" && (storyOrder === undefined || event.storyOrder <= storyOrder));
    for (const event of events.slice(-5)) lines.push(`  History #${event.storyOrder}: ${event.title} — ${event.summary} [sources: ${event.sourceMessageIds.join(", ")}]`);
  }
  return lines.length === 1 ? "RELATIONSHIP MEMORY: No approved relationship facts are available for this story time. Do not invent them." : lines.join("\n");
}
