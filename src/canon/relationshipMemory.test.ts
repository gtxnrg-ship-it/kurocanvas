import { describe, expect, it } from "vitest";
import {
  buildRelationshipContext,
  proposeRelationshipTransition,
  relationshipAt,
  validateRelationshipRecord,
  type RelationshipRecord,
  type RelationshipSnapshot,
} from "./relationshipMemory";

const enemies: RelationshipSnapshot = {
  state: "enemies", trust: 5, warmth: 0, tension: 95,
  emotionalNotes: ["A betrayed the group and B still remembers the cost."],
  interactionPattern: ["They watch each other's hands.", "Arguments become personal quickly."],
  boundaries: ["B does not trust A alone with the team."],
  unresolvedWounds: ["An apology has not been made."],
};
const friends: RelationshipSnapshot = {
  state: "friends", trust: 68, warmth: 70, tension: 24,
  emotionalNotes: ["They chose to save each other despite their history.", "Forgiveness is real but not effortless."],
  interactionPattern: ["They tease each other to defuse fear.", "B still notices when A goes quiet."],
  boundaries: ["Trust is rebuilding; betrayal is still a sensitive subject."],
  unresolvedWounds: ["They have not discussed the original betrayal fully."],
};
function sample(): RelationshipRecord {
  return {
    id: "rel-a-b", universeId: "u1", characterAId: "a", characterBId: "b", directional: false,
    current: enemies,
    history: [{
      id: "ev1", universeId: "u1", relationshipId: "rel-a-b", storyOrder: 1, title: "Betrayal",
      summary: "They became enemies.", cause: "A betrayed the group.", consequences: ["B stopped trusting A."],
      sourceMessageIds: ["m1"], canonStatus: "approved", before: friends, after: enemies,
    }],
    updatedAt: new Date(0).toISOString(),
  };
}
describe("temporal relationship memory", () => {
  it("preserves enemy history when a proposed transition makes them friends", () => {
    const record = sample();
    const transition = proposeRelationshipTransition(record, {
      id: "ev2", storyOrder: 2, title: "Saved each other", summary: "They begin to trust each other again.",
      cause: "Each risked their life for the other.", consequences: ["They cooperate, but old wounds remain."],
      sourceMessageIds: ["m2"], after: friends,
    });
    expect(transition.before.state).toBe("enemies");
    expect(transition.after.state).toBe("friends");
    expect(transition.canonStatus).toBe("proposed");
    expect(record.history).toHaveLength(1);
  });
  it("returns the approved relationship state at the requested story time", () => {
    const record = sample();
    record.history.push({
      id: "ev2", universeId: "u1", relationshipId: "rel-a-b", storyOrder: 2, title: "Reconciliation",
      summary: "They became friends.", cause: "Mutual sacrifice.", consequences: ["Trust begins to return."],
      sourceMessageIds: ["m2"], canonStatus: "approved", before: enemies, after: friends,
    });
    expect(relationshipAt(record, 1)?.state).toBe("enemies");
    expect(relationshipAt(record, 2)?.state).toBe("friends");
    expect(relationshipAt(record, 0)).toBeUndefined();
  });
  it("includes emotional patterns and refuses cross-universe context", () => {
    const record = sample();
    const context = buildRelationshipContext([record], "u1");
    expect(context).toContain("watch each other's hands");
    expect(context).toContain("apology");
    expect(buildRelationshipContext([record], "u2")).toContain("No approved relationship records");
  });
  it("validates relationship scope and temporal ordering", () => {
    const record = sample();
    expect(validateRelationshipRecord(record, "u1")).toEqual([]);
    expect(validateRelationshipRecord(record, "u2").join(" ")).toMatch(/different universe|scope mismatch/i);
  });
});
