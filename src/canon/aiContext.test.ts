import { describe, expect, it } from "vitest";
import { buildApprovedCanonContext } from "./aiContext";
import { createEmptyCanon, type CanonEntity, type CanonFact } from "./universe";

const entity: CanonEntity = { id: "hero", projectId: "series-a", kind: "character", name: "Mira", aliases: ["The Fox"], status: "approved" };
const fact = (id: string, status: CanonFact["status"], value: unknown): CanonFact => ({
  id, projectId: "series-a", subjectId: "hero", predicate: "secret", value, status,
});
const bundle = { ...createEmptyCanon("series-a"), entities: [entity], facts: [fact("f-approved", "approved", "She is the heir"), fact("f-proposed", "proposed", "She is immortal"), fact("f-inferred", "inferred", "She fears fire")] };

describe("approved canon AI context", () => {
  it("includes approved facts while excluding proposals and inferences", () => {
    const result = buildApprovedCanonContext(bundle, { projectId: "series-a", userMessage: "Mira secret" });
    expect(result).toContain("She is the heir");
    expect(result).not.toContain("She is immortal");
    expect(result).not.toContain("She fears fire");
    expect(result).toContain("APPROVED CANON ONLY");
  });
  it("refuses cross-project context", () => {
    expect(() => buildApprovedCanonContext(bundle, { projectId: "series-b", userMessage: "Mira" })).toThrow(/does not belong/);
  });
  it("returns an empty context for an empty or irrelevant bible", () => {
    expect(buildApprovedCanonContext(createEmptyCanon("series-a"), { projectId: "series-a", userMessage: "anything" })).toBe("");
  });
  it("bounds the context size", () => {
    const huge = { ...bundle, facts: [fact("huge", "approved", "x".repeat(5000))] };
    expect(buildApprovedCanonContext(huge, { projectId: "series-a", userMessage: "Mira", maxCharacters: 700 }).length).toBeLessThanOrEqual(700);
  });
});
