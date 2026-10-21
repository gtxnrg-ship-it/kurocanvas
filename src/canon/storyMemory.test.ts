import { describe, expect, it } from "vitest";
import { buildStoryMemoryContext, filterStoryMemoryAtPoint, proposeChapterMemory, retrieveStoryMemory, shouldCaptureStoryMemory, validateStoryMemoryForApproval, validateStoryMemoryRecord, type StoryMemoryRecord } from "./storyMemory";
describe("story memory capture triggers", () => {
  it.each([
    "A new character named Mira joins the team.",
    "In chapter 12, Mira becomes the queen.",
    "The event changes his powers and appearance.",
    "Flashback: she remembers the old alliance.",
    "He is no longer the captain after the betrayal.",
    "Save this chapter to the story vault.",
  ])("recognizes narrative details worth proposing: %s", text => {
    expect(shouldCaptureStoryMemory(text)).toBe(true);
  });

  it.each([
    "Can you make the buttons a little rounder?",
    "The canvas toolbar should feel faster.",
    "Please change the app background color.",
  ])("does not trigger on unrelated UI requests: %s", text => {
    expect(shouldCaptureStoryMemory(text)).toBe(false);
  });
});

const record = (overrides: Partial<StoryMemoryRecord> = {}): StoryMemoryRecord => ({
  id: "chapter-12", projectId: "series-a", kind: "chapter", title: "The silver oath",
  summary: "Mira learns that the silver oath was broken at the old bridge; her left sleeve is torn.",
  chapterNumber: 12, sceneNumber: 3, storyOrder: 120, entityIds: ["mira"], tags: ["oath", "bridge", "flashback"],
  source: "user", status: "approved", assetRefs: ["panel-bridge-03", "template-flashback-blue"],
  supersedes: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});
describe("durable story memory", () => {
  it("retrieves chapter flashback and exact reusable panel/template refs", () => {
    const result = retrieveStoryMemory([record()], { projectId: "series-a", chapterNumber: 12, text: "silver oath flashback" });
    expect(result.records[0].id).toBe("chapter-12"); expect(result.assetRefs).toEqual(["panel-bridge-03", "template-flashback-blue"]);
  });

  it("prevents future chapter recaps from entering an earlier chapter prompt", () => {
    const earlier = record({ id: "chapter-2", chapterNumber: 2, storyOrder: 20, timelineId: "main", title: "Old bridge", summary: "Mira visits the bridge." });
    const current = record({ id: "chapter-3", chapterNumber: 3, storyOrder: 30, timelineId: "main", title: "Oath", summary: "Mira makes the oath." });
    const future = record({ id: "chapter-80", chapterNumber: 80, storyOrder: 800, timelineId: "main", title: "Final emperor reveal", summary: "The Secret Emperor is defeated." });
    const result = filterStoryMemoryAtPoint([earlier, current, future], "series-a", { productionRequest: true, chapterNumber: 3, timelineId: "main" });
    expect(result.map(item => item.id)).toEqual(["chapter-2", "chapter-3"]);
    expect(result.some(item => item.summary.includes("Secret Emperor"))).toBe(false);
  });
  it("requires explicit chronology for production prompts and filters by story order", () => {
    const first = record({ id: "s10", chapterNumber: 1, storyOrder: 10, timelineId: "main" });
    const second = record({ id: "s20", chapterNumber: 2, storyOrder: 20, timelineId: "main" });
    const future = record({ id: "s30", chapterNumber: 3, storyOrder: 30, timelineId: "main" });
    const unknown = record({ id: "unknown-order", chapterNumber: undefined, sceneNumber: undefined, storyOrder: undefined, timelineId: "main" });
    expect(filterStoryMemoryAtPoint([first, second, future, unknown], "series-a", { productionRequest: true }).map(item=>item.id)).toEqual([]);
    expect(filterStoryMemoryAtPoint([first, second, future, unknown], "series-a", { productionRequest: true, storyOrder: 20, timelineId: "main" }).map(item=>item.id)).toEqual(["s10", "s20"]);
  });
  it("isolates chapter memories by timeline and withholds untagged temporal history", () => {
    const main = record({ id: "main-2", chapterNumber: 2, storyOrder: 20, timelineId: "main" });
    const mainPastNoOrder = record({ id: "main-1", chapterNumber: 1, storyOrder: undefined, timelineId: "main" });
    const sameChapterUnknownOrder = record({ id: "main-3-unknown", chapterNumber: 3, storyOrder: undefined, timelineId: "main" });
    const echo = record({ id: "echo-2", chapterNumber: 2, storyOrder: 20, timelineId: "echo" });
    const untagged = record({ id: "legacy-unscoped", chapterNumber: 1, storyOrder: 10, timelineId: undefined });
    const timeless = record({ id: "world-note", chapterNumber: undefined, sceneNumber: undefined, storyOrder: undefined, timelineId: undefined });
    const selected = filterStoryMemoryAtPoint([main, mainPastNoOrder, sameChapterUnknownOrder, echo, untagged, timeless], "series-a", {
      productionRequest: true, chapterNumber: 3, storyOrder: 30, timelineId: "main",
    });
    expect(selected.map(item => item.id)).toEqual(["main-2", "main-1", "world-note"]);
    expect(filterStoryMemoryAtPoint([main, echo, untagged, timeless], "series-a", {
      productionRequest: true, chapterNumber: 3, storyOrder: 30,
    }).map(item => item.id)).toEqual(["world-note"]);
  });

  it("leaves private brainstorming unrestricted while staying project-scoped", () => {
    const future = record({ id: "chapter-80", chapterNumber: 80, storyOrder: 800 });
    const otherProject = record({ id: "foreign", projectId: "series-b", chapterNumber: 1 });
    expect(filterStoryMemoryAtPoint([future, otherProject], "series-a", { productionRequest: false }).map(item=>item.id)).toEqual(["chapter-80"]);
  });
  it("never leaks memory across projects", () => expect(retrieveStoryMemory([record()], { projectId: "series-b", text: "Mira" }).records).toHaveLength(0));
  it("treats missing history as unknown and warns instead of fabricating it", () => {
    const result = retrieveStoryMemory([], { projectId: "series-a", chapterNumber: 99, text: "final battle" });
    expect(result.warnings.join(" ")).toMatch(/Do not invent/); expect(result.warnings.join(" ")).toMatch(/do not establish current chapter canon|not established/i);
  });
  it("keeps proposed memories out of approved-only retrieval", () => expect(retrieveStoryMemory([record({ status: "proposed" })], { projectId: "series-a", text: "silver oath" }).records).toHaveLength(0));
  it("marks user chapter recaps as proposed until approval", () => {
    const draft = proposeChapterMemory({ id: "chapter-13", projectId: "series-a", title: "After the bridge", summary: "Mira returns at dawn.", chapterNumber: 13, entityIds: ["mira"], tags: ["dawn"], assetRefs: [], supersedes: [] });
    expect(draft.status).toBe("proposed"); expect(draft.source).toBe("user");
  });
  it("requires time-bound proposals to be assigned to a timeline before approval", () => {
    const unscoped = record({ id: "captured-chapter", chapterNumber: 4, timelineId: undefined });
    expect(validateStoryMemoryRecord(unscoped, "series-a")).toEqual([]);
    expect(validateStoryMemoryForApproval(unscoped, "series-a")).toContain("Time-bound memories need a timeline ID before approval.");
    expect(validateStoryMemoryForApproval({ ...unscoped, timelineId: "main" }, "series-a")).toEqual([]);
  });
  it("validates project boundaries and required detail", () => expect(validateStoryMemoryRecord(record(), "series-b")).toContain("Memory belongs to a different project."));
  it("keeps chapter-linked superseded history distinguishable from approved canon", () => {
    const oldState = record({ id: "mira-before", chapterNumber: 4, status: "superseded", summary: "Mira has a long braid before the bridge event." });
    const result = retrieveStoryMemory([oldState], { projectId: "series-a", chapterNumber: 4, text: "Mira flashback" });
    expect(result.records.map(item => item.id)).toContain("mira-before");
    expect(result.warnings.join(" ")).toMatch(/no matching approved story memory/i);
    expect(result.warnings.join(" ")).toMatch(/historical only/i);
    expect(retrieveStoryMemory([oldState], { projectId: "series-a", text: "Mira current appearance" }).records).toHaveLength(0);
  });
  it("marks superseded records as historical in the model context", () => {
    const context = buildStoryMemoryContext({ records: [record({ status: "superseded" })], assetRefs: [], warnings: [] });
    expect(context).toMatch(/SUPERSEDED records are old revisions, not active canon/i);
    expect(context).toMatch(/only when the user explicitly asks/i);
  });
  it("does not treat visual asset IDs as evidence of image contents", () => {
    const context = buildStoryMemoryContext({ records: [record({ assetRefs: ["drawing:canvas-17"] })], assetRefs: ["drawing:canvas-17"], warnings: [] });
    expect(context).toMatch(/not visual evidence by themselves/i);
    expect(context).toMatch(/Never describe an unseen drawing/i);
  });
  it("bounds context length", () => expect(buildStoryMemoryContext({ records: [record({ summary: "x".repeat(6000) })], assetRefs: [], warnings: [] }, 700).length).toBeLessThanOrEqual(700));
});
