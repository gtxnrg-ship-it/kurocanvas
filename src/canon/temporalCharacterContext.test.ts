import { describe, expect, it } from "vitest";
import { buildTemporalCharacterContext } from "./temporalCharacterContext";
import type { CharacterEvolutionState } from "./characterEvolution";

const state = (overrides: Partial<CharacterEvolutionState> = {}): CharacterEvolutionState => ({
  id: "s1", universeId: "u1", characterId: "c1", timelineId: "main", storyOrder: 10,
  status: "approved", appearance: { ageYears: 16, hairLength: "short" },
  relationshipStateRefs: [], assetRefs: [], sourceMessageIds: [], changeSummary: "First appearance",
  createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

describe("temporal character prompt context", () => {
  it("includes the last approved state before the target point, never a future proposal", () => {
    const output = buildTemporalCharacterContext([
      state(),
      state({ id: "s2", storyOrder: 20, appearance: { ageYears: 18, hairLength: "mid-back" }, changeSummary: "Time skip" }),
      state({ id: "s3", storyOrder: 30, status: "proposed", appearance: { ageYears: 21 } }),
    ], { universeId: "u1", timelineId: "main", storyOrder: 25, characterIds: ["c1"] });
    expect(output).toContain("Age: 18");
    expect(output).toContain("mid-back");
    expect(output).not.toContain("Age: 21");
  });

  it("keeps other universes and timelines out and marks absent state as unknown", () => {
    const output = buildTemporalCharacterContext([
      state({ universeId: "other", appearance: { ageYears: 99 } }),
      state({ id: "alt", timelineId: "alternate", appearance: { ageYears: 88 } }),
    ], { universeId: "u1", timelineId: "main", storyOrder: 50, characterIds: ["c1"] });
    expect(output).toContain("No approved appearance state");
    expect(output).not.toContain("Age: 99");
    expect(output).not.toContain("Age: 88");
  });

  it("requires an explicit timeline and bounded output", () => {
    expect(() => buildTemporalCharacterContext([], { universeId: "u1", timelineId: "", storyOrder: 1, characterIds: ["c1"] })).toThrow();
    expect(buildTemporalCharacterContext([], { universeId: "u1", timelineId: "main", storyOrder: 1, characterIds: [], maxOutputCharacters: 1 })).toContain("No character IDs");
  });
});
