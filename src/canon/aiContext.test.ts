import { describe, expect, it } from "vitest";
import { buildApprovedCanonContext, filterConversationTurnsForRevealGate, hasUnrevealedCharacterMention, isStoryProductionRequest, resolveApprovedRevealPoint } from "./aiContext";
import type { CharacterEvolutionState } from "./characterEvolution";
import { createEmptyCanon, type CanonEntity, type CanonFact } from "./universe";

const entity: CanonEntity = { id: "hero", projectId: "series-a", kind: "character", name: "Mira", aliases: ["The Fox"], status: "approved" };
const fact = (id: string, status: CanonFact["status"], value: unknown): CanonFact => ({
  id, projectId: "series-a", subjectId: "hero", predicate: "secret", value, status,
});
const bundle = { ...createEmptyCanon("series-a"), entities: [entity], facts: [fact("f-approved", "approved", "She is the heir"), fact("f-proposed", "proposed", "She is immortal"), fact("f-inferred", "inferred", "She fears fire")] };

describe("approved canon AI context", () => {
  it("resolves the target chapter from the latest approved state at the requested story order", () => {
    const state = (id: string, storyOrder: number, chapterNumber: number): CharacterEvolutionState => ({
      id, universeId: "u1", characterId: "hero", timelineId: "main", storyOrder, chapterNumber,
      status: "approved", appearance: { ageYears: 16 }, relationshipStateRefs: [], assetRefs: [],
      sourceMessageIds: [], changeSummary: "Approved position", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const result = resolveApprovedRevealPoint({
      enabled: true, universeId: "u1", timelineId: "main", storyOrder: 20,
      states: [state("hero-ch1", 10, 1), state("hero-ch2", 20, 2)],
    });
    expect(result).toEqual({ timelineId: "main", storyOrder: 20, chapterNumber: 2, ambiguous: false });
  });

  it("fails closed when the requested chapter conflicts with the approved story-order mapping", () => {
    const state = (id: string, storyOrder: number, chapterNumber: number): CharacterEvolutionState => ({
      id, universeId: "u1", characterId: "hero", timelineId: "main", storyOrder, chapterNumber,
      status: "approved", appearance: { ageYears: 16 }, relationshipStateRefs: [], assetRefs: [],
      sourceMessageIds: [], changeSummary: "Approved position", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const result = resolveApprovedRevealPoint({
      enabled: true, universeId: "u1", timelineId: "main", storyOrder: 20, chapterNumber: 1,
      states: [state("hero-ch1", 10, 1), state("hero-ch2", 20, 2)],
    });
    expect(result.ambiguous).toBe(true);
  });

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
      projectId: "series-a", userMessage: "write chapter 4 The Secret Emperor identity",
      revealGate: { enabled: true, universeId: "u1", states: [
        state("hero-ch1", "hero", 10, 1),
        state("secret-preload", "secret", 5, 1, 40),
        state("hero-ch4", "hero", 50, 4),
      ], chapterNumber: 4 },
    });
    expect(result).toContain("The Secret Emperor");
    expect(result).toContain("Silver Sovereign");
  });

  it("removes prior transcript turns that name unrevealed cast while preserving unrelated discussion", () => {
    const secret: CanonEntity = { id: "secret", projectId: "series-a", kind: "character", name: "The Secret Emperor", aliases: ["Silver Sovereign"], status: "approved" };
    const secretState: CharacterEvolutionState = {
      id: "secret-state", universeId: "u1", characterId: "secret", timelineId: "main", storyOrder: 3,
      revealAtStoryOrder: 20, status: "approved", appearance: { hairColor: "silver" },
      relationshipStateRefs: [], assetRefs: [], sourceMessageIds: [], changeSummary: "future", createdAt: "2026-01-01T00:00:00.000Z",
    };
    const turns = [
      { role: "user", content: "Let's design The Secret Emperor's silver armor." },
      { role: "assistant", content: "The Silver Sovereign wears silver hair and an imperial mantle." },
      { role: "user", content: "Our hero walks back to the school." },
    ];
    const result = filterConversationTurnsForRevealGate(turns, { ...bundle, entities: [entity, secret] }, {
      enabled: true, universeId: "u1", states: [secretState],
    });
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("hero walks");
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
    expect(guarded).toContain("STORY OUTPUT CONTINUITY GUARD");
    const brainstorm = buildApprovedCanonContext(testBundle, { projectId: "series-a", userMessage: "tell me about the emperor" });
    expect(brainstorm).toContain("The Secret Emperor");
    expect(isStoryProductionRequest("Write Chapter 1")).toBe(true);
    expect(isStoryProductionRequest("Start Chapter 1")).toBe(true);
    expect(isStoryProductionRequest("Make panel 2")).toBe(true);
    expect(isStoryProductionRequest("Draw panel 3")).toBe(true);
    expect(isStoryProductionRequest("Continue the story")).toBe(true);
    expect(isStoryProductionRequest("Write the next installment")).toBe(true);
    expect(isStoryProductionRequest("Illustrate the final battle")).toBe(true);
    expect(isStoryProductionRequest("Generate a reveal scene")).toBe(true);
    expect(isStoryProductionRequest("Let's brainstorm the emperor privately")).toBe(false);
    expect(isStoryProductionRequest("Let's brainstorm Chapter 1")).toBe(false);
    expect(isStoryProductionRequest("Brainstorm and write Chapter 1")).toBe(true);
  });

  it("excludes later approved canon facts from an earlier story-production prompt", () => {
    const secret: CanonEntity = { id: "secret", projectId: "series-a", kind: "character", name: "The Secret Emperor", aliases: [], status: "approved" };
    const city: CanonEntity = { id: "sun-city", projectId: "series-a", kind: "location", name: "Sun City", aliases: [], status: "approved" };
    const futureFact: CanonFact = {
      id: "future-city-fall", projectId: "series-a", subjectId: "sun-city",
      predicate: "destruction", value: "Sun City is destroyed after the treaty breaks",
      status: "approved", storyOrder: 40, timelineId: "main",
    };
    const alternateTimelineFact: CanonFact = {
      id: "alternate-city-outcome", projectId: "series-a", subjectId: "sun-city",
      predicate: "fate", value: "Sun City survives in the Echo timeline",
      status: "approved", storyOrder: 5, timelineId: "echo",
    };
    const ambiguousTimedFact: CanonFact = {
      id: "untagged-timed-outcome", projectId: "series-a", subjectId: "sun-city",
      predicate: "fate", value: "Sun City falls after the rebellion",
      status: "approved", storyOrder: 5,
    };
    const state = (id: string, characterId: string, storyOrder: number, chapterNumber: number, revealAtStoryOrder?: number): CharacterEvolutionState => ({
      id, universeId: "u1", characterId, timelineId: "main", storyOrder, chapterNumber, status: "approved",
      ...(revealAtStoryOrder === undefined ? {} : { revealAtStoryOrder }),
      appearance: { ageYears: 16 }, relationshipStateRefs: [], assetRefs: [], sourceMessageIds: [],
      changeSummary: "Approved story point", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const testBundle = {
      ...bundle,
      entities: [entity, secret, city],
      facts: [fact("city-location", "approved", "The market is near the river"), futureFact, alternateTimelineFact, ambiguousTimedFact],
    };
    const result = buildApprovedCanonContext(testBundle, {
      projectId: "series-a",
      userMessage: "Sun City destruction treaty breaks",
      revealGate: {
        enabled: true, universeId: "u1",
        states: [state("hero-ch1", "hero", 10, 1), state("secret-preload", "secret", 5, 1, 40)],
        chapterNumber: 1,
      },
    });
    expect(result).toContain("Sun City (location)");
    expect(result).not.toContain("Sun City is destroyed after the treaty breaks");
    expect(result).not.toContain("Sun City survives in the Echo timeline");
    expect(result).not.toContain("Sun City falls after the rebellion");
  });

  it("detects hidden character names in production output without matching partial words", () => {
    const secret: CanonEntity = { id: "secret", projectId: "series-a", kind: "character", name: "The Secret Emperor", aliases: ["Silver Sovereign"], status: "approved" };
    const state = (id: string, characterId: string, storyOrder: number, chapterNumber: number, revealAtStoryOrder?: number): CharacterEvolutionState => ({
      id, universeId: "u1", characterId, timelineId: "main", storyOrder, chapterNumber, status: "approved",
      ...(revealAtStoryOrder === undefined ? {} : { revealAtStoryOrder }),
      appearance: { ageYears: 16 }, relationshipStateRefs: [], assetRefs: [], sourceMessageIds: [],
      changeSummary: "Approved story point", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const testBundle = { ...bundle, entities: [entity, secret] };
    const gate = { enabled: true, universeId: "u1", states: [
      state("hero-ch1", "hero", 10, 1),
      state("secret-preload", "secret", 5, 1, 40),
    ], chapterNumber: 1 };
    expect(hasUnrevealedCharacterMention("The Secret Emperor appears at dawn.", testBundle, gate)).toBe(true);
    expect(hasUnrevealedCharacterMention("Silver Sovereign watches.", testBundle, gate)).toBe(true);
    expect(hasUnrevealedCharacterMention("This secret remains undiscovered.", testBundle, gate)).toBe(false);
  });

  it("bounds the context size", () => {
    const huge = { ...bundle, facts: [fact("huge", "approved", "x".repeat(5000))] };
    expect(buildApprovedCanonContext(huge, { projectId: "series-a", userMessage: "Mira", maxCharacters: 700 }).length).toBeLessThanOrEqual(700);
  });
});
