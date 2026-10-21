/**
 * Temporal relationship canon for Kuro.
 *
 * Relationships are stateful, directional when needed, and grounded in approved
 * events. Never replace the past with the present: a former enemy who is now a
 * friend must remain both facts, with the transition and emotional consequences.
 */
export type RelationshipState =
  | "strangers" | "acquaintances" | "allies" | "friends" | "close-friends"
  | "rivals" | "enemies" | "estranged" | "romantic" | "family" | "custom";

export interface RelationshipSnapshot {
  state: RelationshipState;
  customState?: string;
  trust: number; // 0..100
  warmth: number; // 0..100
  tension: number; // 0..100
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
  occurredAt?: string;
  title: string;
  summary: string;
  cause: string;
  consequences: string[];
  sourceMessageIds: string[];
  canonStatus: "approved" | "proposed" | "superseded";
  before: RelationshipSnapshot;
  after: RelationshipSnapshot;
}

export interface RelationshipRecord {
  id: string;
  universeId: string;
  characterAId: string;
  characterBId: string;
  /** True when the relationship is intentionally asymmetric. */
  directional: boolean;
  current: RelationshipSnapshot;
  history: RelationshipEvent[];
  updatedAt: string;
}

const STATES = new Set<RelationshipState>([
  "strangers", "acquaintances", "allies", "friends", "close-friends",
  "rivals", "enemies", "estranged", "romantic", "family", "custom",
]);

function validSnapshot(value: RelationshipSnapshot): boolean {
  return !!value && STATES.has(value.state)
    && Number.isFinite(value.trust) && value.trust >= 0 && value.trust <= 100
    && Number.isFinite(value.warmth) && value.warmth >= 0 && value.warmth <= 100
    && Number.isFinite(value.tension) && value.tension >= 0 && value.tension <= 100
    && Array.isArray(value.emotionalNotes) && value.emotionalNotes.every(x => typeof x === "string")
    && Array.isArray(value.interactionPattern) && value.interactionPattern.every(x => typeof x === "string")
    && Array.isArray(value.boundaries) && value.boundaries.every(x => typeof x === "string")
    && Array.isArray(value.unresolvedWounds) && value.unresolvedWounds.every(x => typeof x === "string")
    && (value.state !== "custom" || !!value.customState?.trim());
}

export function validateRelationshipRecord(record: RelationshipRecord, universeId: string): string[] {
  const errors: string[] = [];
  if (!record.id?.trim()) errors.push("Relationship needs a stable ID.");
  if (!universeId.trim() || record.universeId !== universeId) errors.push("Relationship belongs to a different universe.");
  if (!record.characterAId?.trim() || !record.characterBId?.trim()) errors.push("Both character IDs are required.");
  if (record.characterAId === record.characterBId) errors.push("A character cannot have a relationship with itself.");
  if (!validSnapshot(record.current)) errors.push("Current relationship snapshot is invalid.");
  if (!Array.isArray(record.history)) errors.push("Relationship history must be an array.");
  else {
    let lastOrder = -Infinity;
    for (const event of record.history) {
      if (event.universeId !== universeId || event.relationshipId !== record.id) errors.push("Relationship event scope mismatch.");
      if (!Number.isFinite(event.storyOrder) || event.storyOrder < lastOrder) errors.push("Relationship events must be ordered by story time.");
      lastOrder = event.storyOrder;
      if (!validSnapshot(event.before) || !validSnapshot(event.after)) errors.push("Relationship event has an invalid before/after snapshot.");
      if (!event.title?.trim() || !event.summary?.trim() || !event.cause?.trim()) errors.push("Relationship event needs title, summary, and cause.");
      if (!Array.isArray(event.sourceMessageIds) || !Array.isArray(event.consequences)) errors.push("Relationship provenance and consequences must be arrays.");
    }
  }
  return [...new Set(errors)];
}

/** Return the relationship that was actually true at a story point, not just today's state. */
export function relationshipAt(record: RelationshipRecord, storyOrder: number): RelationshipSnapshot | undefined {
  if (!Number.isFinite(storyOrder)) throw new Error("A valid story order is required.");
  const approved = record.history
    .filter(event => event.canonStatus === "approved" && event.storyOrder <= storyOrder)
    .sort((a, b) => a.storyOrder - b.storyOrder);
  return approved.length ? structuredClone(approved[approved.length - 1].after) : undefined;
}

/** Explicitly transition a relationship while preserving the previous state and emotional context. */
export function proposeRelationshipTransition(
  record: RelationshipRecord,
  input: Omit<RelationshipEvent, "relationshipId" | "universeId" | "before" | "canonStatus">,
): RelationshipEvent {
  if (!validSnapshot(input.after)) throw new Error("The proposed relationship state is invalid.");
  if (input.storyOrder < 0 || !Number.isFinite(input.storyOrder)) throw new Error("A valid story order is required.");
  const previousOrder = record.history.reduce((latest, event) => Math.max(latest, event.storyOrder), -Infinity);
  if (input.storyOrder <= previousOrder) throw new Error("A relationship transition must occur after existing history; use an explicit retcon workflow to revise earlier canon.");
  return {
    ...input,
    universeId: record.universeId,
    relationshipId: record.id,
    before: structuredClone(record.current),
    canonStatus: "proposed",
    after: structuredClone(input.after),
  };
}

/** Human-readable context for dialogue/scene planning; includes change and unresolved emotional debt. */
export function buildRelationshipContext(records: readonly RelationshipRecord[], universeId: string, storyOrder?: number): string {
  if (!universeId.trim()) throw new Error("Choose a universe before retrieving relationships.");
  const lines = ["RELATIONSHIP CONTINUITY — use only records in this universe."];
  const scoped = records.filter(record => record.universeId === universeId);
  for (const record of scoped) {
    const snapshot = storyOrder === undefined ? record.current : relationshipAt(record, storyOrder);
    if (!snapshot) continue;
    lines.push(`Relationship ${record.id}: ${record.characterAId} ↔ ${record.characterBId}`);
    lines.push(`State: ${snapshot.state}${snapshot.customState ? " (" + snapshot.customState + ")" : ""}; trust ${snapshot.trust}/100; warmth ${snapshot.warmth}/100; tension ${snapshot.tension}/100.`);
    if (snapshot.emotionalNotes.length) lines.push("Emotional history: " + snapshot.emotionalNotes.join("; "));
    if (snapshot.interactionPattern.length) lines.push("How they interact: " + snapshot.interactionPattern.join("; "));
    if (snapshot.boundaries.length) lines.push("Boundaries: " + snapshot.boundaries.join("; "));
    if (snapshot.unresolvedWounds.length) lines.push("Unresolved wounds: " + snapshot.unresolvedWounds.join("; "));
    const events = record.history.filter(event => event.canonStatus === "approved" && (storyOrder === undefined || event.storyOrder <= storyOrder));
    for (const event of events) lines.push(`History @${event.storyOrder}: ${event.title} — ${event.summary} Cause: ${event.cause}. Consequences: ${event.consequences.join("; ")}.`);
  }
  if (!scoped.length) lines.push("No approved relationship records found. Do not invent the relationship; ask for the missing canon.");
  return lines.join("\n");
}
