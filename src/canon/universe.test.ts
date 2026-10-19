import { describe, expect, it } from "vitest";
import { createEmptyCanon, findCanonContradictions, getRetconImpact, proposeCanonRevision, retrieveCanon, validateCanon, type CanonEntity, type CanonFact } from "./universe";

const character: CanonEntity = { id: "c1", projectId: "p1", kind: "character", name: "Mira", aliases: ["The Fox"], status: "approved" };
const fact = (overrides: Partial<CanonFact> = {}): CanonFact => ({ id: "f1", projectId: "p1", subjectId: "c1", predicate: "alive", value: true, status: "approved", storyOrder: 1, ...overrides });

describe("project canon core", () => {
  it("creates an empty project-scoped bundle", () => expect(createEmptyCanon("p1").projectId).toBe("p1"));
  it("rejects retrieval across project boundaries", () => expect(() => retrieveCanon({ schemaVersion: 1, projectId: "p1", entities: [character], facts: [fact()] }, { projectId: "p2" })).toThrow());
  it("retrieves matching aliases and approved facts", () => {
    const result = retrieveCanon({ schemaVersion: 1, projectId: "p1", entities: [character], facts: [fact()] }, { projectId: "p1", text: "Fox" });
    expect(result.entities.map(e => e.id)).toEqual(["c1"]);
    expect(result.facts.map(f => f.id)).toEqual(["f1"]);
  });
  it("flags potentially conflicting approved facts but not different story orders", () => {
    const bundle = { schemaVersion: 1 as const, projectId: "p1", entities: [character], facts: [fact(), fact({ id: "f2", value: false, storyOrder: 1 }), fact({ id: "f3", value: false, storyOrder: 2 })] };
    expect(findCanonContradictions(bundle)).toHaveLength(1);
    expect(validateCanon(bundle).some(issue => issue.code === "possible-contradiction")).toBe(true);
  });
  it("calculates transitive retcon impact", () => {
    const bundle = { schemaVersion: 1 as const, projectId: "p1", entities: [character], facts: [fact(), fact({ id: "f2", subjectId: "c1", dependsOn: ["f1"] })] };
    expect(getRetconImpact(bundle, ["c1"]).factIds.sort()).toEqual(["f1", "f2"]);
  });
  it("keeps revisions proposed instead of silently changing canon", () => {
    const revised = proposeCanonRevision(fact(), "f2", false);
    expect(revised.status).toBe("proposed");
    expect(revised.supersedesFactId).toBe("f1");
  });
});
