import { describe, expect, it } from "vitest";
import { buildApprovedCanonContext } from "./promptContext";
import type { CanonBundle } from "./universe";

const base: CanonBundle = {
  schemaVersion: 1,
  projectId: "series-a",
  entities: [
    { id: "mira", projectId: "series-a", kind: "character", name: "Mira", aliases: ["The Fox"], status: "approved" },
    { id: "place", projectId: "series-a", kind: "location", name: "Glass Harbor", aliases: [], status: "approved" },
    { id: "idea", projectId: "series-a", kind: "character", name: "Possible Villain", aliases: [], status: "proposed" },
  ],
  facts: [
    { id: "f1", projectId: "series-a", subjectId: "mira", predicate: "hidden secret", value: "Mira is secretly the missing heir", status: "approved", storyOrder: 5 },
    { id: "f2", projectId: "series-a", subjectId: "mira", predicate: "weapon", value: "silver needle", status: "approved" },
    { id: "f3", projectId: "series-a", subjectId: "mira", predicate: "future twist", value: "Mira owns the moon", status: "proposed" },
    { id: "f4", projectId: "series-a", subjectId: "idea", predicate: "identity", value: "the villain", status: "approved" },
  ],
};

describe("approved canon prompt context", () => {
  it("finds facts by predicate/value, not only entity name", () => {
    const context = buildApprovedCanonContext(base, "series-a", "What is the hidden secret?");
    expect(context).toContain("hidden secret");
    expect(context).toContain("missing heir");
  });
  it("never passes proposed entities or facts as approved canon", () => {
    const context = buildApprovedCanonContext(base, "series-a", "Tell me the secret and future twist");
    expect(context).not.toContain("Possible Villain");
    expect(context).not.toContain("Mira owns the moon");
    expect(context).toContain("missing heir");
  });
  it("refuses cross-project bundles", () => {
    expect(() => buildApprovedCanonContext(base, "series-b", "hello")).toThrow(/selected project/i);
  });
  it("labels a missing bible as unknown rather than fabricating facts", () => {
    expect(buildApprovedCanonContext(undefined, "series-a", "write a scene")).toContain("unknown");
  });
  it("does not leak unapproved-only subjects through approved facts", () => {
    const context = buildApprovedCanonContext(base, "series-a", "villain identity");
    expect(context).not.toContain("Possible Villain");
    expect(context).not.toContain("the villain");
  });
});
