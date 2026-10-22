import { describe, expect, it } from "vitest";
import { approveSeriesPlan } from "./seriesPlan";
import type { ChapterReadinessInput } from "./chapterReadiness";
import {
  evaluateChapterReadiness,
  isWholeSeriesPlanningRequest,
  requiresApprovedStoryFoundations,
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
    ...approveSeriesPlan({
      seriesScope: "A complete 3-chapter fantasy mystery for vertical-scroll comic format.",
      seriesArcPlan: "The first arc introduces Mira and Ren and the mystery of a broken sky. The middle escalates the investigation and strains their trust. The final arc reveals the observatory's secret and resolves their relationship.",
      seriesChapterPlan: [
        "Chapter 1: Mira finds a strange lantern and hides it from Ren, triggering the central mystery.",
        "Chapter 2: The friends explore the observatory and uncover evidence that changes what they believe.",
        "Chapter 3: Mira and Ren confront the observatory keeper, solve the mystery, and rebuild trust.",
      ].join("\n"),
      seriesEnding: "The finale explains the broken sky, resolves the conflict between Mira and Ren, pays off the lantern clue, and leaves the city transformed but stable.",
    }),
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

  it("requires a complete explicitly approved series plan before chapter production", () => {
    const draft = { ...base.artDirection!, seriesPlanApproved: false, seriesPlanApprovalSignature: "" };
    const blocked = evaluateChapterReadiness({ ...base, artDirection: draft });
    expect(blocked.ready).toBe(false);
    expect(blocked.gaps.map(gap => gap.id)).toContain("series-plan");
    const editedAfterApproval = { ...base.artDirection!, seriesEnding: base.artDirection!.seriesEnding + " New ending." };
    const stale = evaluateChapterReadiness({ ...base, artDirection: editedAfterApproval });
    expect(stale.ready).toBe(false);
    expect(stale.gaps.map(gap => gap.id)).toContain("series-plan");
    expect(evaluateChapterReadiness(base).ready).toBe(true);
  });

  it("blocks a chapter until required foundations are present", () => {
    const report = evaluateChapterReadiness({ hasUniverse: false });
    expect(report.ready).toBe(false);
    expect(report.gaps.map(gap => gap.id)).toEqual(expect.arrayContaining([
      "universe", "world", "cast", "art-direction",
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

  it("keeps whole-series outlining in chat instead of routing it into chapter production", () => {
    const request = "Help me outline the entire Webtoon series from chapter 1 through the finale.";
    expect(isWholeSeriesPlanningRequest(request)).toBe(true);
    expect(requiresApprovedStoryFoundations(request)).toBe(false);
    expect(isWholeSeriesPlanningRequest("Draw the opening Webtoon chapter.")).toBe(false);
    expect(isWholeSeriesPlanningRequest("Plan a scene for chapter one.")).toBe(false);
  });

  it("holds story prose, dialogue, scenes, and panel production until foundations are ready", () => {
    expect(requiresApprovedStoryFoundations("Write the opening scene where Mira meets Ren.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Draft the dialogue between the protagonist and her rival.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Generate a fight sequence for episode two.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Write the first paragraph.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Let's discuss the opening scene before writing it.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Research clothing in 1920s Kyoto for the opening scene.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Help me develop Mira's backstory and character profile.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Create a character sheet for Mira.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Don't write the scene yet; let's brainstorm it.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Don't write yet, but outline the opening scene.")).toBe(true);
  });


  it("gates reader-facing artifacts expressed as show, give, include, or add", () => {
    expect(requiresApprovedStoryFoundations("Give me dialogue between Mira and Ren.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Show me an example scene with Mira and Ren.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Include a short conversation in the opening chapter.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Add two lines of dialogue to the first scene.")).toBe(true);
    expect(requiresApprovedStoryFoundations("Don't show me dialogue yet; let's brainstorm.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Don't show me dialogue yet, but give me one example line.")).toBe(true);
  });

  it("leaves ideation and research open when the user asks for options rather than an artifact", () => {
    expect(requiresApprovedStoryFoundations("Give me ideas for the story.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Show me options for the opening scene.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Let's brainstorm the opening scene.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Research historical details for the first chapter.")).toBe(false);
    expect(requiresApprovedStoryFoundations("Show me references for the opening scene.")).toBe(false);
  });
  it("allows an explicit provisional experiment without treating it as approved canon", () => {
    expect(requestsProvisionalChapterOverride("Make a rough storyboard for chapter one anyway.")).toBe(true);
    expect(requestsProvisionalChapterOverride("Bypass the worldbuilding foundation for an experimental scene.")).toBe(true);
    expect(requestsProvisionalChapterOverride("Don't start the chapter yet; finish the worldbuilding first.")).toBe(false);
    expect(requestsProvisionalChapterOverride("Let's discuss a rough storyboard, but don't create it yet.")).toBe(false);
  });
});
