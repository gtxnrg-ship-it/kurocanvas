import { describe, expect, it } from "vitest";
import { buildApprovedCanonContext, isStoryProductionRequest } from "./aiContext";
import type { CharacterEvolutionState } from "./characterEvolution";
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
  it("withholds preloaded characters and facts that identify them before the requested chapter reveal", () => {
    const secret: CanonEntity = { id: "secret", projectId: "series-a", kind: "character", name: "The Secret Emperor", aliases: ["Silver Sovereign"], status: "approved" };
    const publicFact: CanonFact = { id: "public-fact", projectId: "series-a", subjectId: "hero", predicate: "mission", value: "Protect the city", status: "approved" };
    const secretFact: CanonFact = { id: "secret-fact", projectId: "series-a", subjectId: "secret", predicate: "true_identity", value: "The Secret Emperor is the Silver Sovereign", status: "approved" };
    const indirectLeak: CanonFact = { id: "indirect-leak", projectId: "series-a", subjectId: "hero", predicate: "foe", value: "The Secret Emperor controls the Silver Sovereign army", status: "approved" };
    const chapterState = (overrides: Partial<CharacterEvolutionState> = {}): CharacterEvolutionState => ({
      id: "hero-chapter-one", universeId: "u1", characterId: "hero", timelineId: "main", storyOrder: 10,
      chapterNumber: 1, status: "approved", appearance: { ageYears: 16 }, relationshipStateRefs: [], assetRefs: [],
      sourceMessageIds: [], changeSummary: "First chapter", createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
    });
    const futureSecret = chapterState({
      id: "secret-preload", characterId: "secret", storyOrder: 5, revealAtStoryOrder: 40,
      chapterNumber: 1, appearance: { ageYears: 38, hairColor: "silver" }, changeSummary: "Preloaded reveal design",
    });
    const testBundle = { ...bundle, entities: [entity, secret], facts: [publicFact, secretFact, indirectLeak] };
    const result = buildApprovedCanonContext(testBundle, {
      projectId: "series-a", userMessage: "write chapter 1 mission and enemies",
      revealGate: { enabled: true, universeId: "u1", states: [chapterState(), futureSecret], chapterNumber: 1 },
    });
    expect(result).toContain("Protect the city");
    expect(result).toContain("STORY OUTPUT REVEAL GUARD");
    expect(result).not.toContain("The Secret Emperor");
    expect(result).not.toContain("Silver Sovereign");
    expect(result).not.toContain("secret-fact");
  });

  it("allows the character after the mapped story order reaches the reveal gate", () => {
    const secret: CanonEntity = { id: "secret", projectId: "series-a", kind: "character", name: "The Secret Emperor", aliases: ["Silver Sovereign"], status: "approved" };
    const secretFact: CanonFact = { id: "secret-fact", projectId: "series-a", subjectId: "secret", predicate: "true_identity", value: "The Secret Emperor is the Silver Sovereign", status: "approved" };
    const state = (id: string, characterId: string, storyOrder: number, chapterNumber: number, revealAtStoryOrder?: number): CharacterEvolutionState => ({
      id, universeId: "u1", characterId, timelineId: "main", storyOrder, chapterNumber, status: "approved",
      ...(revealAtStoryOrder === undefined ? {} : { revealAtStoryOrder }),
      appearance: { ageYears: 16 }, relationshipStateRefs: [], assetRefs: [], sourceMessageIds: [],
      changeSummary: "Approved chapter position", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const testBundle = { ...bundle, entities: [entity, secret], facts: [secretFact] };
    const result = buildApprovedCanonContext(testBundle, {
      projectId: "series-a", userMessage: "write chapter 4",
      revealGate: { enabled: true, universeId: "u1", states: [
        state("hero-ch1", "hero", 10, 1),
        state("secret-preload", "secret", 5, 1, 40),
        state("hero-ch4", "hero", 50, 4),
      ], chapterNumber: 4 },
    });
    expect(result).toContain("The Secret Emperor");
    expect(result).toContain("Silver Sovereign");
  });

  it("fails closed on an unresolved story point but leaves private brainstorming unrestricted", () => {
    const secret: CanonEntity = { id: "secret", projectId: "series-a", kind: "character", name: "The Secret Emperor", aliases: [], status: "approved" };
    const secretFact: CanonFact = { id: "secret-fact", projectId: "series-a", subjectId: "secret", predicate: "identity", value: "The Secret Emperor is the emperor", status: "approved" };
    const future: CharacterEvolutionState = {
      id: "secret-state", universeId: "u1", characterId: "secret", timelineId: "main", storyOrder: 3,
      revealAtStoryOrder: 20, status: "approved", appearance: { hairColor: "silver" },
      relationshipStateRefs: [], assetRefs: [], sourceMessageIds: [], changeSummary: "future", createdAt: "2026-01-01T00:00:00.000Z",
    };
    const testBundle = { ...bundle, entities: [entity, secret], facts: [secretFact] };
    const guarded = buildApprovedCanonContext(testBundle, {
      projectId: "series-a", userMessage: "draw a scene",
      revealGate: { enabled: true, universeId: "u1", states: [future] },
    });
    expect(guarded).not.toContain("The Secret Emperor");
    expect(guarded).toContain("STORY OUTPUT REVEAL GUARD");
    const brainstorm = buildApprovedCanonContext(testBundle, { projectId: "series-a", userMessage: "tell me about the emperor" });
    expect(brainstorm).toContain("The Secret Emperor");
    expect(isStoryProductionRequest("Write Chapter 1")).toBe(true);
    expect(isStoryProductionRequest("Draw panel 3")).toBe(true);
    expect(isStoryProductionRequest("Let's brainstorm the emperor privately")).toBe(false);
  });

  it("bounds the context size", () => {
    const huge = { ...bundle, facts: [fact("huge", "approved", "x".repeat(5000))] };
    expect(buildApprovedCanonContext(huge, { projectId: "series-a", userMessage: "Mira", maxCharacters: 700 }).length).toBeLessThanOrEqual(700);
  });
});
