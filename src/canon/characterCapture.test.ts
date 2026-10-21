import { describe, expect, it } from "vitest";
import { proposeCharacterEntitiesFromEvidence } from "./characterCapture";
import type { CanonEntity } from "./universe";

describe("evidence-backed character proposals", () => {
  const message = "Chapter 4 introduces Mira, also called the Glass Fox, as the new captain.";
  const candidate = { name: "Mira", evidence: message, aliases: ["Glass Fox", "The Queen"] };

  it("creates a proposed character only from an exact user quote", () => {
    const result = proposeCharacterEntitiesFromEvidence([candidate], message, [], "project-1", () => "id-1");
    expect(result).toEqual([{ id: "id-1", projectId: "project-1", kind: "character", name: "Mira", aliases: ["Glass Fox"], status: "proposed" }]);
  });

  it("rejects invented quotes and names absent from the evidence", () => {
    expect(proposeCharacterEntitiesFromEvidence([{ ...candidate, evidence: "Chapter 4 introduces Mira as a queen." }], message, [], "p", () => "id")).toEqual([]);
    expect(proposeCharacterEntitiesFromEvidence([{ ...candidate, name: "Ren" }], message, [], "p", () => "id")).toEqual([]);
  });

  it("does not duplicate existing characters or their aliases", () => {
    const existing: CanonEntity[] = [{ id: "existing", projectId: "project-1", kind: "character", name: "Mira", aliases: ["Glass Fox"], status: "approved" }];
    expect(proposeCharacterEntitiesFromEvidence([candidate], message, existing, "project-1", () => "id")).toEqual([]);
    expect(proposeCharacterEntitiesFromEvidence([{ ...candidate, name: "Glass Fox" }], message, existing, "project-1", () => "id")).toEqual([]);
  });

  it("never auto-approves a newly detected character", () => {
    const result = proposeCharacterEntitiesFromEvidence([candidate], message, [], "p", () => "id");
    expect(result[0].status).toBe("proposed");
  });
});
