import { describe, expect, it } from "vitest";
import { createEmptyCanon, type CanonBundle } from "./universe";
import { createEmptyStyleBible, type ProjectStyleBible } from "./styleBible";
import { createCharacterDesignHandoff } from "./characterDesignHandoff";
import type { StoryMemoryRecord } from "./storyMemory";

const makeExisting = () => ({
  canon: createEmptyCanon("project-1"),
  styleBible: createEmptyStyleBible("project-1"),
  storyMemories: [] as StoryMemoryRecord[],
});
const baseInput = {
  projectId: "project-1",
  drawingId: "drawing-1",
  characterName: "Mira",
  aliases: ["Mira Vale"],
  traits: { hair: "short silver hair", eyes: "gold eyes", outfit: "dark blue coat" },
};
const ids = (() => { let n = 0; return () => "record-" + (++n); })();

describe("character design to World & Vault handoff", () => {
  it("creates a project-scoped proposed character, visual state and linked visual record", () => {
    const result = createCharacterDesignHandoff(baseInput, makeExisting(), { now: "2026-10-22T00:00:00.000Z", createId: ids });
    expect(result.character).toMatchObject({ projectId: "project-1", kind: "character", name: "Mira", aliases: ["Mira Vale"], status: "proposed" });
    expect(result.canon.entities).toContainEqual(result.character);
    expect(result.visualState).toMatchObject({ characterName: "Mira", hair: "short silver hair", eyes: "gold eyes", outfit: "dark blue coat", status: "proposed", storyOrder: 0 });
    expect(result.storyMemory).toMatchObject({
      projectId: "project-1",
      kind: "visual-reference",
      status: "proposed",
      source: "user",
      entityIds: [result.character.id],
      assetRefs: ["drawing:drawing-1"],
      tags: ["character-design", "visual-draft"],
      createdAt: "2026-10-22T00:00:00.000Z",
    });
    expect(result.storyMemory.summary).toContain("not approved canon");
  });

  it("creates a new proposed visual version for an existing character without replacing canon", () => {
    const existing = makeExisting();
    const character = { id: "char-mira", projectId: "project-1", kind: "character", name: "Mira", aliases: [], status: "approved" as const };
    existing.canon = { ...existing.canon, entities: [character] };
    const result = createCharacterDesignHandoff({ ...baseInput, existingEntityId: character.id }, existing, { createId: () => "new-id" });
    expect(result.canon.entities).toEqual([character]);
    expect(result.character.status).toBe("approved");
    expect(result.visualState.status).toBe("proposed");
    expect(result.storyMemory.entityIds).toEqual(["char-mira"]);
    expect(result.storyMemory.assetRefs).toEqual(["drawing:drawing-1"]);
  });

  it("rejects duplicate character names instead of silently creating two canon records", () => {
    const existing = makeExisting();
    existing.canon = { ...existing.canon, entities: [{ id: "char-mira", projectId: "project-1", kind: "character", name: "Mira", aliases: [], status: "approved" }] };
    expect(() => createCharacterDesignHandoff(baseInput, existing)).toThrow(/already exists/i);
  });

  it("rejects another project's canon or visual bible", () => {
    expect(() => createCharacterDesignHandoff(baseInput, {
      canon: createEmptyCanon("project-2"),
      styleBible: createEmptyStyleBible("project-1"),
    })).toThrow(/same active project/i);
    const existing = makeExisting();
    existing.styleBible = createEmptyStyleBible("project-2");
    expect(() => createCharacterDesignHandoff(baseInput, existing)).toThrow(/same active project/i);
  });

  it("requires at least one creator-entered visual trait", () => {
    expect(() => createCharacterDesignHandoff({ ...baseInput, traits: {} }, makeExisting())).toThrow(/at least one appearance detail/i);
  });

  it("prevents linking the same drawing twice", () => {
    const existing = makeExisting();
    existing.storyMemories = [{
      id: "mem-1", projectId: "project-1", kind: "visual-reference", title: "Old design", summary: "Already linked",
      entityIds: [], tags: [], source: "user", status: "proposed", assetRefs: ["drawing:drawing-1"],
      supersedes: [], createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z",
    }];
    expect(() => createCharacterDesignHandoff(baseInput, existing)).toThrow(/already linked/i);
  });
});
