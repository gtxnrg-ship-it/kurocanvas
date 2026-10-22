import { describe, expect, it } from "vitest";
import { createCharacterDesignHandoff } from "./characterDesignHandoff";
import { createEmptyCanon } from "./universe";
import { createEmptyStyleBible, buildStyleBibleContext } from "./styleBible";
import type { StoryMemoryRecord } from "./storyMemory";
import { parseAIStrokePlan } from "../drawing/aiPlan";
import { applyCommandsToLocalDrawing } from "../drawing/localDrawingBridge";
import { verifyDrawingReadback } from "../drawing/drawingReadback";
import type { LocalDrawingDocument } from "../core/storage";

describe("character design journey integration", () => {
  it("keeps a saved design out of writing context until its proposal is approved", () => {
    const projectId = "world-mira";
    const handoff = createCharacterDesignHandoff({
      projectId,
      drawingId: "drawing-mira",
      characterName: "Mira",
      chapterNumber: 3,
      storyOrder: 30,
      traits: {
        age: "19",
        hair: "short silver hair",
        scars: "thin scar over the left eyebrow",
        outfit: "dark blue coat",
      },
    }, {
      canon: createEmptyCanon(projectId),
      styleBible: createEmptyStyleBible(projectId),
      storyMemories: [] as StoryMemoryRecord[],
    }, { now: "2026-10-22T00:00:00.000Z", createId: (() => { let id = 0; return () => "journey-" + (++id); })() });

    expect(handoff.character.status).toBe("proposed");
    expect(handoff.visualState.status).toBe("proposed");
    expect(handoff.storyMemory.status).toBe("proposed");
    expect(handoff.storyMemory.assetRefs).toEqual(["drawing:drawing-mira"]);

    const beforeApproval = buildStyleBibleContext(handoff.styleBible, projectId, "Write chapter 3", 5200, 30);
    expect(beforeApproval).not.toContain("short silver hair");
    expect(beforeApproval).not.toContain("thin scar over the left eyebrow");

    const approvedBible = {
      ...handoff.styleBible,
      characterStates: handoff.styleBible.characterStates.map(state => ({ ...state, status: "approved" as const })),
    };
    const approvedContext = buildStyleBibleContext(approvedBible, projectId, "Write the next scene", 5200, 30);
    expect(approvedContext).toContain("Mira");
    expect(approvedContext).toContain("short silver hair");
    expect(approvedContext).toContain("thin scar over the left eyebrow");
    expect(approvedContext).toContain("dark blue coat");

    const earlierContext = buildStyleBibleContext(approvedBible, projectId, "Write chapter 2", 5200, 20);
    expect(earlierContext).not.toContain("short silver hair");
    expect(earlierContext).not.toContain("thin scar over the left eyebrow");
  });

  it("never allows a design handoff to be read as another project's writing context", () => {
    const handoff = createCharacterDesignHandoff({
      projectId: "world-one",
      drawingId: "drawing-one",
      characterName: "Kuro",
      traits: { hair: "black bob" },
    }, {
      canon: createEmptyCanon("world-one"),
      styleBible: createEmptyStyleBible("world-one"),
    }, { createId: (() => { let id = 0; return () => "isolated-" + (++id); })() });

    expect(() => buildStyleBibleContext(handoff.styleBible, "world-two", "Write chapter one")).toThrow(/another project/i);
  });
  it("connects a validated native drawing to the correct proposed character record", () => {
    const projectId = "world-native-mira";
    const drawing: LocalDrawingDocument = {
      id: "drawing-native-mira",
      projectId,
      name: "Mira · character draft",
      version: 1,
      width: 800,
      height: 600,
      background: "#fffdfb",
      updatedAt: "2026-10-22T00:00:00.000Z",
      layers: [{ id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" }],
      strokes: [],
    };
    const bounds = { width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [], strokeLayerById: {} };
    const proposed = parseAIStrokePlan(JSON.stringify({
      summary: "Block in Mira's silhouette",
      commands: [{
        version: 1,
        id: "mira-silhouette",
        type: "stroke.add",
        layerId: "ink",
        tool: "brush",
        color: "#20202a",
        size: 4,
        points: [{ x: 400, y: 80, pressure: 0.7 }, { x: 370, y: 180, pressure: 0.7 }, { x: 430, y: 180, pressure: 0.7 }],
      }],
    }), bounds);

    const savedDrawing = applyCommandsToLocalDrawing(drawing, proposed.commands).document;
    expect(savedDrawing.projectId).toBe(projectId);
    expect(savedDrawing.strokes).toHaveLength(1);
    expect(verifyDrawingReadback(savedDrawing, { ...savedDrawing, updatedAt: "2026-10-22T00:00:01.000Z" })).toEqual({ ok: true });

    const handoff = createCharacterDesignHandoff({
      projectId,
      drawingId: savedDrawing.id,
      characterName: "Mira",
      traits: { age: "19", hair: "short silver hair", outfit: "dark blue coat" },
    }, {
      canon: createEmptyCanon(projectId),
      styleBible: createEmptyStyleBible(projectId),
      storyMemories: [] as StoryMemoryRecord[],
    }, { createId: (() => { let id = 0; return () => "native-journey-" + (++id); })() });

    expect(handoff.storyMemory.assetRefs).toEqual(["drawing:drawing-native-mira"]);
    expect(handoff.visualState).toMatchObject({ projectId, characterName: "Mira", status: "proposed" });
    expect(buildStyleBibleContext(handoff.styleBible, projectId, "Write the next scene")).not.toContain("short silver hair");
    expect(() => buildStyleBibleContext(handoff.styleBible, "different-world", "Write chapter one")).toThrow(/another project/i);
  });
});
