import { describe, expect, it } from "vitest";
import type { ChapterReadinessInput } from "./chapterReadiness";
import {
  evaluateChapterReadiness,
  formatChapterReadinessMessage,
  requiresHistoricalResearchForChapter,
  requestsProvisionalChapterOverride,
} from "./chapterReadiness";

const base: ChapterReadinessInput = {
  hasUniverse: true,
  canon: {
    entities: [
      { id: "city", projectId: "project", kind: "location", name: "Morrow City", aliases: [], status: "approved" },
      { id: "rules", projectId: "project", kind: "rule", name: "The Lantern Rule", aliases: [], status: "approved" },
      { id: "protagonist", projectId: "project", kind: "character", name: "Mira", aliases: ["Mi"], status: "approved" },
      { id: "friend", projectId: "project", kind: "character", name: "Ren", aliases: [], status: "approved" },
    ],
    facts: [
      { id: "fact-1", projectId: "project", subjectId: "city", predicate: "location", value: "A coastal city built around an old observatory", status: "approved" },
      { id: "fact-2", projectId: "project", subjectId: "rules", predicate: "world rule", value: "Luminous power fades at noon", status: "approved" },
      { id: "fact-3", projectId: "project", subjectId: "city", predicate: "history", value: "The city was founded after the eclipse", status: "approved" },
      { id: "proposed-fact", projectId: "project", subjectId: "city", predicate: "government", value: "A proposed idea", status: "proposed" },
    ],
  },
  artDirection: {
    title: "Lantern Coast",
    premise: "Two friends investigate a broken sky.",
    genres: "Fantasy mystery",
    visualStyle: "Clean expressive linework, graphic shadows, warm lantern accents.",
  },
  styleBible: {
    characterStates: [
      { id: "mira-visual", characterName: "Mira", storyOrder: 1, chapterLabel: "Chapter 1", age: "17", hair: "short dark bob", eyes: "amber", outfit: "navy jacket", status: "approved" },
      { id: "ren-visual", characterName: "Ren", storyOrder: 1, chapterLabel: "Chapter 1", hair: "long tied hair", eyes: "green", outfit: "cream coat", status: "approved" },
    ],
  },
  characterTimelines: [
    { characterId: "protagonist", timelineId: "main", storyOrder: 1, status: "approved" },
    { characterId: "friend", timelineId: "main", storyOrder: 1, status: "approved" },
  ],
  relationships: [
    { characterAId: "protagonist", characterBId: "friend" },
  ],
  researchTasks: [
    { status: "completed", sources: [{ title: "Research basis", url: "https://example.org/source", extract: "A grounded source extract." }] },
  ],
};

describe("chapter readiness gate", () => {
  it("allows production only when every approved character has a visual state and timeline", () => {
    const report = evaluateChapterReadiness(base);
    expect(report.ready).toBe(true);
    expect(report.approvedCharacterCount).toBe(2);
    expect(report.approvedWorldFactCount).toBe(3);
    expect(report.approvedRelationshipCount).toBe(1);
    expect(report.gaps).toEqual([]);
  });

  it("blocks a chapter until required foundations are present", () => {
    const report = evaluateChapterReadiness({ hasUniverse: false });
    expect(report.ready).toBe(false);
    expect(report.gaps.map(gap => gap.id)).toEqual(expect.arrayContaining([
      "universe", "world", "cast", "art-direction", "character-design", "timeline",
    ]));
    expect(formatChapterReadinessMessage(report)).toContain("Still needed:");
    expect(formatChapterReadinessMessage(report)).toContain("World Bible");
  });

  it("does not count proposed world facts or proposed character designs as canon", () => {
    const report = evaluateChapterReadiness({
      ...base,
      canon: {
        entities: base.canon!.entities.map(entity => entity.id === "city" ? { ...entity, status: "proposed" as const } : entity)
          .map(entity => entity.id === "protagonist" ? { ...entity, status: "proposed" } : entity),
        facts: base.canon!.facts.filter(fact => fact.id !== "proposed-fact").map(fact => ({ ...fact, status: "proposed" as const })),
      },
      styleBible: { characterStates: base.styleBible!.characterStates.map(state => ({ ...state, status: "proposed" as const })) },
    });
    expect(report.ready).toBe(false);
    expect(report.approvedCharacterCount).toBe(1);
    expect(report.approvedWorldFactCount).toBe(0);
    expect(report.gaps.map(gap => gap.id)).toContain("world");
    expect(report.gaps.map(gap => gap.id)).toContain("character-design");
  });

  it("requires completed sourced research only for an explicitly historical/factual brief", () => {
    expect(requiresHistoricalResearchForChapter("Let's write a historically accurate chapter one.")).toBe(true);
    expect(requiresHistoricalResearchForChapter("Let's write a fantasy chapter one.")).toBe(false);
    const withoutSources = evaluateChapterReadiness({
      ...base,
      requiresHistoricalResearch: true,
      researchTasks: [{ status: "completed", sources: [] }, { status: "running", sources: [{ title: "Draft", url: "https://example.org", extract: "Not finished" }] }],
    });
    expect(withoutSources.ready).toBe(false);
    expect(withoutSources.gaps.map(gap => gap.id)).toContain("research");
    expect(evaluateChapterReadiness({ ...base, requiresHistoricalResearch: true }).ready).toBe(true);
  });

  it("blocks when any approved character is missing a visual design or timeline state", () => {
    const report = evaluateChapterReadiness({
      ...base,
      styleBible: {
        characterStates: base.styleBible!.characterStates.filter(state => state.characterName !== "Ren"),
      },
      characterTimelines: base.characterTimelines!.filter(state => state.characterId !== "friend"),
    });
    expect(report.ready).toBe(false);
    expect(report.gaps.find(gap => gap.id === "character-design")?.message).toContain("Ren");
    expect(report.gaps.find(gap => gap.id === "timeline")?.message).toContain("Ren");
  });

  it("requires relationship canon only when two or more approved characters exist", () => {
    const singleCharacter = {
      ...base,
      canon: { ...base.canon!, entities: base.canon!.entities.filter(entity => entity.id !== "friend") },
      relationships: [],
    };
    expect(evaluateChapterReadiness(singleCharacter).gaps.map(gap => gap.id)).not.toContain("relationships");
    expect(evaluateChapterReadiness({ ...base, relationships: [] }).gaps.map(gap => gap.id)).toContain("relationships");
  });

  it("allows an explicit provisional experiment without treating it as approved canon", () => {
    expect(requestsProvisionalChapterOverride("Make a rough storyboard for chapter one anyway.")).toBe(true);
    expect(requestsProvisionalChapterOverride("Bypass the worldbuilding foundation for an experimental scene.")).toBe(true);
    expect(requestsProvisionalChapterOverride("Don't start the chapter yet; finish the worldbuilding first.")).toBe(false);
    expect(requestsProvisionalChapterOverride("Let's discuss a rough storyboard, but don't create it yet.")).toBe(false);
  });
});
