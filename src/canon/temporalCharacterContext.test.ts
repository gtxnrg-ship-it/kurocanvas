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

  it("does not reveal preloaded future cast names or designs before its reveal gate", () => {
    const hidden = state({
      id: "secret-antagonist", characterId: "secret-antagonist", storyOrder: 5, revealAtStoryOrder: 40,
      appearance: {
        ageYears: 38, hairColor: "silver", visualNotes: ["THE SECRET EMPEROR; never show before the cliffhanger"],
        bodyIdentity: { bodyInstanceId: "imperial-body", incarnationKind: "original", identityContinuity: "same-person" },
      },
    });
    const beforeReveal = buildTemporalCharacterContext([hidden], {
      universeId: "u1", timelineId: "main", storyOrder: 39, characterIds: ["secret-antagonist"],
    });
    expect(beforeReveal).toContain("VAULT REVEAL GATE");
    expect(beforeReveal).toContain("No reveal-eligible character details");
    expect(beforeReveal).not.toContain("secret-antagonist");
    expect(beforeReveal).not.toContain("THE SECRET EMPEROR");
    expect(beforeReveal).not.toContain("silver");
    expect(beforeReveal).not.toContain("imperial-body");

    const afterReveal = buildTemporalCharacterContext([hidden], {
      universeId: "u1", timelineId: "main", storyOrder: 40, characterIds: ["secret-antagonist"],
    });
    expect(afterReveal).toContain("THE SECRET EMPEROR");
    expect(afterReveal).toContain("silver");
    expect(afterReveal).toContain("imperial-body");
  });

  it("carries forward body and injury lifecycle details while omitting future body changes", () => {
    const oldBody = state({
      storyOrder: 10,
      appearance: {
        ageYears: 34, hairColor: "brown", height: "183 cm",
        bodyIdentity: { bodyInstanceId: "old-body", incarnationKind: "original", identityContinuity: "same-person" },
        physicalConditions: [{
          id: "broken-arm", kind: "fracture", label: "Broken left arm", bodyRegion: "left forearm", stage: "active",
          severity: 4, firstSeenStoryOrder: 10, healingProgressPercent: 10, painLevel: 8,
          visibleDescription: "swollen and held against the chest", functionalImpact: "cannot grip", permanentMark: false,
        }],
      },
    });
    const reborn = state({
      id: "reborn", storyOrder: 30,
      appearance: {
        ageYears: 15,
        bodyIdentity: {
          bodyInstanceId: "new-body", incarnationKind: "reincarnation", identityContinuity: "same-person",
          memoryContinuity: "full", previousBodyInstanceId: "old-body", ageAtIncarnation: 15,
        },
        physicalConditions: [{
          id: "broken-arm", kind: "fracture", label: "Broken left arm", bodyRegion: "left forearm", stage: "healing",
          severity: 4, firstSeenStoryOrder: 10, healingProgressPercent: 45, painLevel: 4,
          visibleDescription: "splinted, bruising fading from purple to yellow", functionalImpact: "cannot grip firmly",
          permanentMark: false,
        }],
      },
    });
    const output = buildTemporalCharacterContext([oldBody, reborn], {
      universeId: "u1", timelineId: "main", storyOrder: 20, characterIds: ["c1"],
    });
    expect(output).toContain("Body instance: old-body");
    expect(output).toContain("Height/build: 183 cm");
    expect(output).toContain("[broken-arm; fracture; active]");
    expect(output).not.toContain("new-body");
    expect(output).not.toContain("Age: 15");
    const later = buildTemporalCharacterContext([oldBody, reborn], {
      universeId: "u1", timelineId: "main", storyOrder: 30, characterIds: ["c1"],
    });
    expect(later).toContain("Body instance: new-body");
    expect(later).toContain("Previous body: old-body");
    expect(later).toContain("healing: 45%");
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

  it("does not let an unrevealed alternate-timeline preload create a spoiler ambiguity", () => {
    const visible = state({ id: "visible-main", timelineId: "main", storyOrder: 10, appearance: { ageYears: 16 } });
    const hidden = state({
      id: "hidden-alt", timelineId: "what-if", storyOrder: 1, revealAtStoryOrder: 80,
      appearance: { ageYears: 99, visualNotes: ["unrevealed alternate-timeline secret"] },
    });
    const output = resolveTemporalCharacterContext([visible, hidden], {
      universeId: "u1", characterIds: ["c1"], storyOrder: 20,
    });
    expect(output.status).toBe("resolved");
    expect(output.context).toContain("Age: 16");
    expect(output.context).not.toContain("unrevealed alternate-timeline secret");
  });
});
