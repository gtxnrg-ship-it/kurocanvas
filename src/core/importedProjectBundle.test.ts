import { describe, expect, it } from "vitest";
import { createProject } from "./project";
import { createChatUniverse } from "./universe";
import { validateImportedProjectBundle, type ImportedProjectBundle } from "./storage";
import type { StoryMemoryRecord } from "../canon/storyMemory";
import type { LocalDrawingDocument } from "./storage";

function bundle(): ImportedProjectBundle {
  return {
    project: createProject("Atomic import test"),
    references: [], characterModels: [], drawings: [], memories: [], universes: [], conversations: [], messages: [], relationships: [], characterStates: [],
  };
}

function memory(projectId: string, overrides: Partial<StoryMemoryRecord> = {}): StoryMemoryRecord {
  return {
    id: "memory-1", projectId, kind: "chapter", title: "First chapter", summary: "The crew reaches the bridge.",
    chapterNumber: 1, entityIds: [], tags: [], source: "imported", status: "approved", assetRefs: [], supersedes: [],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
  };
}

const drawing = (projectId: string): LocalDrawingDocument => ({
  id: "drawing-1", projectId, name: "Panel 1", version: 1, width: 1600, height: 1200,
  background: "#fffdfb", strokes: [], updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("atomic project import preflight", () => {
  it("accepts a valid project and an empty optional-data package", () => {
    expect(validateImportedProjectBundle(bundle())).toEqual([]);
  });

  it("rejects malformed collection shapes before iterating them", () => {
    const value = bundle() as unknown as Record<string, unknown>;
    value.references = { unexpected: true };
    expect(validateImportedProjectBundle(value as unknown as ImportedProjectBundle)).toContain("Imported reference sources must be a list.");
  });

  it("rejects a drawing or memory that escapes the freshly imported project", () => {
    const value = bundle();
    value.drawings.push(drawing("some-other-project"));
    value.memories.push(memory("some-other-project"));
    const errors = validateImportedProjectBundle(value);
    expect(errors).toContain("Imported drawing is invalid or belongs to a different project.");
    expect(errors).toContain("Memory belongs to a different project.");
  });

  it("requires every imported universe to include its own home conversation", () => {
    const value = bundle();
    const universeBundle = createChatUniverse("Missing home chat", value.project.id);
    value.universes.push(universeBundle.universe);
    expect(validateImportedProjectBundle(value)).toContain("Imported universe is missing its own home conversation.");
    value.conversations.push(universeBundle.homeConversation);
    expect(validateImportedProjectBundle(value)).toEqual([]);
  });

  it("rejects transcript messages that point at a foreign or missing conversation", () => {
    const value = bundle();
    const universeBundle = createChatUniverse("Transcript", value.project.id);
    value.universes.push(universeBundle.universe);
    value.conversations.push(universeBundle.homeConversation);
    value.messages.push({
      id: "message-1", universeId: universeBundle.universe.id, conversationId: "foreign-conversation",
      role: "user", content: "Keep the old outfit.", createdAt: "2026-01-01T00:00:00.000Z",
      status: "complete", approvedActionIds: [], metadata: {},
    });
    expect(validateImportedProjectBundle(value)).toContain("Imported chat message is invalid or references a different conversation.");
  });

  it("rejects duplicate record IDs before attempting the multi-store transaction", () => {
    const value = bundle();
    value.memories.push(memory(value.project.id), memory(value.project.id, { title: "Duplicate" }));
    expect(validateImportedProjectBundle(value).some(error => /duplicate ID memory-1/i.test(error))).toBe(true);
  });
});
