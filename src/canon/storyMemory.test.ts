import { describe, expect, it } from "vitest";
import { buildStoryMemoryContext, proposeChapterMemory, retrieveStoryMemory, validateStoryMemoryRecord, type StoryMemoryRecord } from "./storyMemory";
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
  it("never leaks memory across projects", () => expect(retrieveStoryMemory([record()], { projectId: "series-b", text: "Mira" }).records).toHaveLength(0));
  it("treats missing history as unknown and warns instead of fabricating it", () => {
    const result = retrieveStoryMemory([], { projectId: "series-a", chapterNumber: 99, text: "final battle" });
    expect(result.warnings.join(" ")).toMatch(/Do not invent/); expect(result.warnings.join(" ")).toMatch(/not established/);
  });
  it("keeps proposed memories out of approved-only retrieval", () => expect(retrieveStoryMemory([record({ status: "proposed" })], { projectId: "series-a", text: "silver oath" }).records).toHaveLength(0));
  it("marks user chapter recaps as proposed until approval", () => {
    const draft = proposeChapterMemory({ id: "chapter-13", projectId: "series-a", title: "After the bridge", summary: "Mira returns at dawn.", chapterNumber: 13, entityIds: ["mira"], tags: ["dawn"], assetRefs: [], supersedes: [] });
    expect(draft.status).toBe("proposed"); expect(draft.source).toBe("user");
  });
  it("validates project boundaries and required detail", () => expect(validateStoryMemoryRecord(record(), "series-b")).toContain("Memory belongs to a different project."));
  it("keeps superseded character states available for chapter-specific flashbacks", () => {
    const oldState = record({ id: "mira-before", chapterNumber: 4, status: "superseded", summary: "Mira has a long braid before the bridge event." });
    const result = retrieveStoryMemory([oldState], { projectId: "series-a", chapterNumber: 4, text: "Mira flashback" });
    expect(result.records.map(item => item.id)).toContain("mira-before");
    expect(retrieveStoryMemory([oldState], { projectId: "series-a", text: "Mira current appearance" }).records).toHaveLength(0);
  });
  it("does not treat visual asset IDs as evidence of image contents", () => {
    const context = buildStoryMemoryContext({ records: [record({ assetRefs: ["drawing:canvas-17"] })], assetRefs: ["drawing:canvas-17"], warnings: [] });
    expect(context).toMatch(/not visual evidence by themselves/i);
    expect(context).toMatch(/Never describe an unseen drawing/i);
  });
  it("bounds context length", () => expect(buildStoryMemoryContext({ records: [record({ summary: "x".repeat(6000) })], assetRefs: [], warnings: [] }, 700).length).toBeLessThanOrEqual(700));
});
