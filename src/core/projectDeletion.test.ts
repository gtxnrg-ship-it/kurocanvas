import { describe, expect, it } from "vitest";
import { buildProjectDeletionManifest } from "./projectDeletion";

const empty = {
  storyMemories: [], referenceSources: [], characterModels: [], drawings: [], drawingRevisions: [],
  universes: [], conversations: [], messages: [], relationships: [], characterStates: [],
};

describe("project deletion manifest", () => {
  it("collects all data owned by the project and its universes", () => {
    const manifest = buildProjectDeletionManifest("project-a", {
      ...empty,
      storyMemories: [{ id: "memory-a", projectId: "project-a" }, { id: "memory-b", projectId: "project-b" }],
      referenceSources: [{ id: "reference-a", projectId: "project-a" }],
      characterModels: [{ id: "model-a", projectId: "project-a" }],
      drawings: [{ id: "drawing-a", projectId: "project-a" }, { id: "legacy", projectId: undefined }, { id: "drawing-b", projectId: "project-b" }],
      drawingRevisions: [{ id: "revision-a", drawingId: "drawing-a" }, { id: "revision-legacy", drawingId: "legacy" }],
      universes: [{ id: "universe-a", projectId: "project-a" }, { id: "universe-b", projectId: "project-b" }],
      conversations: [{ id: "conversation-a", universeId: "universe-a" }, { id: "conversation-b", universeId: "universe-b" }],
      messages: [
        { id: "message-a", universeId: "universe-a", conversationId: "conversation-a" },
        { id: "message-b", universeId: "universe-b", conversationId: "conversation-b" },
      ],
      relationships: [{ id: "relationship-a", universeId: "universe-a" }, { id: "relationship-b", universeId: "universe-b" }],
      characterStates: [{ id: "state-a", universeId: "universe-a" }, { id: "state-b", universeId: "universe-b" }],
    });

    expect(manifest).toEqual({
      storyMemoryIds: ["memory-a"], referenceSourceIds: ["reference-a"], characterModelIds: ["model-a"],
      drawingIds: ["drawing-a"], drawingRevisionIds: ["revision-a"], universeIds: ["universe-a"],
      conversationIds: ["conversation-a"], messageIds: ["message-a"],
      relationshipIds: ["relationship-a"], characterStateIds: ["state-a"],
    });
  });

  it("rejects a missing project identity instead of risking a broad delete", () => {
    expect(() => buildProjectDeletionManifest("  ", empty)).toThrow(/Choose a project/);
  });
});
