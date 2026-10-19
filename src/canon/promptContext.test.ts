import { describe, expect, it } from "vitest";
import { buildApprovedCanonPromptContext } from "./promptContext";
import { createEmptyCanon, type CanonBundle } from "./universe";

const bundle: CanonBundle = {
  ...createEmptyCanon("p1"),
  entities: [
    { id: "c1", projectId: "p1", kind: "character", name: "Mira", aliases: ["Fox"], status: "approved" },
    { id: "c2", projectId: "p1", kind: "character", name: "Draft Mira", aliases: [], status: "proposed" },
  ],
  facts: [
    { id: "f1", projectId: "p1", subjectId: "c1", predicate: "secret", value: "She fears the sea", status: "approved" },
    { id: "f2", projectId: "p1", subjectId: "c1", predicate: "future reveal", value: "She is royalty", status: "proposed" },
    { id: "f3", projectId: "p1", subjectId: "c2", predicate: "alive", value: true, status: "approved" },
  ],
};

describe("approved canon prompt context", () => {
  it("includes matching approved facts even when only the fact value matches", () => {
    const result = buildApprovedCanonPromptContext(bundle, { projectId: "p1", query: "sea" });
    expect(result.text).toContain("She fears the sea");
    expect(result.factIds).toContain("f1");
  });
  it("never promotes proposed entities or facts into trusted context", () => {
    const result = buildApprovedCanonPromptContext(bundle, { projectId: "p1", query: "" });
    expect(result.text).not.toContain("Draft Mira");
    expect(result.text).not.toContain("She is royalty");
    expect(result.factIds).not.toContain("f2");
  });
  it("rejects cross-project context and safely handles an empty bundle", () => {
    expect(() => buildApprovedCanonPromptContext(bundle, { projectId: "p2", query: "Mira" })).toThrow(/active project/i);
    expect(buildApprovedCanonPromptContext(undefined, { projectId: "p1", query: "Mira" }).text).toBe("");
  });
  it("bounds context length and reports truncation", () => {
    const result = buildApprovedCanonPromptContext(bundle, { projectId: "p1", query: "", maxCharacters: 500, maxRecords: 1 });
    expect(result.text.length).toBeLessThanOrEqual(650);
    expect(result.truncated).toBe(true);
  });
});
