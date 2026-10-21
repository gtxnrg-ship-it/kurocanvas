import { describe, expect, it } from "vitest";
import { buildTemporalCharacterContext, resolveTemporalCharacterContext } from "./temporalCharacterContext";
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

describe("natural temporal target resolution", () => {
  it("maps a chapter number through saved chapter metadata, not by pretending it is story order", () => {
    const output = resolveTemporalCharacterContext([
      state({ id: "s-ch1", storyOrder: 2, chapterNumber: 1, appearance: { ageYears: 16 } }),
      state({ id: "s-ch8", storyOrder: 90, chapterNumber: 8, appearance: { ageYears: 18, hairLength: "mid-back" } }),
    ], { universeId: "u1", characterIds: ["c1"], chapterNumber: 8 });
    expect(output).toMatchObject({ status: "resolved", timelineId: "main", storyOrder: 90 });
    expect(output.context).toContain("Age: 18");
    expect(output.context).toContain("mid-back");
  });

  it("uses latest approved state only when a single timeline is available", () => {
    const output = resolveTemporalCharacterContext([
      state({ id: "s1", storyOrder: 10, appearance: { ageYears: 16 } }),
      state({ id: "s2", storyOrder: 20, appearance: { ageYears: 18 } }),
      state({ id: "proposal", storyOrder: 30, status: "proposed", appearance: { ageYears: 25 } }),
    ], { universeId: "u1", characterIds: ["c1"] });
    expect(output).toMatchObject({ status: "resolved", timelineId: "main", storyOrder: 20 });
    expect(output.context).toContain("Age: 18");
    expect(output.context).not.toContain("Age: 25");
  });

  it("asks for a timeline rather than mixing canon from alternate histories", () => {
    const output = resolveTemporalCharacterContext([
      state({ id: "main", timelineId: "main", storyOrder: 10, appearance: { ageYears: 16 } }),
      state({ id: "alternate", timelineId: "what-if", storyOrder: 10, appearance: { ageYears: 40 } }),
    ], { universeId: "u1", characterIds: ["c1"] });
    expect(output.status).toBe("ambiguous");
    expect(output.context).toContain("Ask which timeline applies");
    expect(output.context).not.toContain("Age: 40");
  });

  it("refuses to guess when chapter states exist on multiple timelines", () => {
    const output = resolveTemporalCharacterContext([
      state({ id: "main", timelineId: "main", storyOrder: 10, chapterNumber: 4, appearance: { ageYears: 16 } }),
      state({ id: "alt", timelineId: "what-if", storyOrder: 14, chapterNumber: 4, appearance: { ageYears: 30 } }),
    ], { universeId: "u1", characterIds: ["c1"], chapterNumber: 4 });
    expect(output.status).toBe("ambiguous");
    expect(output.context).toContain("Chapter 4");
    expect(output.context).toContain("multiple timelines");
  });

  it("marks an unrecorded chapter state as unknown instead of falling forward to a later makeover", () => {
    const output = resolveTemporalCharacterContext([
      state({ id: "future", storyOrder: 50, chapterNumber: 12, appearance: { ageYears: 30 } }),
    ], { universeId: "u1", characterIds: ["c1"], chapterNumber: 3 });
    expect(output.status).toBe("unknown");
    expect(output.context).toContain("No approved character state is linked to Chapter 3");
    expect(output.context).not.toContain("Age: 30");
  });

  it("resolves an explicit timeline and story order exactly", () => {
    const output = resolveTemporalCharacterContext([
      state({ id: "s1", timelineId: "main", storyOrder: 10, appearance: { ageYears: 16 } }),
      state({ id: "s2", timelineId: "main", storyOrder: 20, appearance: { ageYears: 18 } }),
    ], { universeId: "u1", characterIds: ["c1"], timelineId: "main", storyOrder: 15 });
    expect(output).toMatchObject({ status: "resolved", timelineId: "main", storyOrder: 15 });
    expect(output.context).toContain("Age: 16");
    expect(output.context).not.toContain("Age: 18");
  });
});
