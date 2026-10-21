import { describe, expect, it } from "vitest";
import { rehomeUniversePackage, serializeUniversePackage, UNIVERSE_PACKAGE_KEYS, type UniversePackageData } from "./universePackage";
import type { UniverseRecord, ConversationRecord, ChatMessageRecord } from "./universe";
import type { RelationshipRecord } from "../canon/relationshipMemory";
import type { CharacterEvolutionState } from "../canon/characterEvolution";

const universe: UniverseRecord = {
  schemaVersion: 1, id: "u-old", title: "My universe", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  lifecycle: "active", projectId: "project-old", homeConversationId: "c-old", isolation: "strict", metadata: {},
};
const conversation: ConversationRecord = {
  schemaVersion: 1, id: "c-old", universeId: "u-old", title: "First conversation", createdAt: universe.createdAt,
  updatedAt: universe.updatedAt, lifecycle: "active", metadata: {},
};
const message: ChatMessageRecord = {
  id: "m-old", universeId: "u-old", conversationId: "c-old", role: "user", content: "They become friends after the rescue.",
  createdAt: universe.createdAt, status: "complete", approvedActionIds: [], metadata: {},
};
const strangers = { state: "strangers" as const, trust: 10, warmth: 5, tension: 40, emotionalNotes: [], interactionPattern: [], boundaries: [], unresolvedWounds: [] };
const friends = { state: "friends" as const, trust: 70, warmth: 75, tension: 10, emotionalNotes: ["mutual respect"], interactionPattern: ["tease then protect"], boundaries: [], unresolvedWounds: [] };
const relationship: RelationshipRecord = {
  schemaVersion: 1, id: "rel-old", universeId: "u-old", characterAId: "char-a", characterBId: "char-b", directional: false,
  current: friends, updatedAt: universe.updatedAt,
  history: [{ id: "event-old", universeId: "u-old", relationshipId: "rel-old", storyOrder: 4, occurredAt: universe.updatedAt,
    title: "The rescue", summary: "Trust grows after the rescue.", cause: "One character risked their life for the other.", consequences: ["They cooperate."],
    sourceMessageIds: ["m-old"], canonStatus: "approved", before: strangers, after: friends }],
};
const characterState: CharacterEvolutionState = {
  id: "state-old", universeId: "u-old", characterId: "char-a", timelineId: "main", storyOrder: 4, status: "approved", appearance: { ageYears: 19 },
  relationshipStateRefs: ["rel-old", "event-old"], assetRefs: ["drawing:d-old"], sourceMessageIds: ["m-old"],
  changeSummary: "After the rescue", createdAt: universe.updatedAt,
};
const data: UniversePackageData = { universes: [universe], conversations: [conversation], messages: [message], relationships: [relationship], characterStates: [characterState] };
const idFactory = () => { let n = 0; return () => "new-" + (++n); };

describe("portable universe history", () => {
  it("round-trips all conversation and continuity collections with new scoped identities", () => {
    const assets = serializeUniversePackage(data);
    const restored = rehomeUniversePackage(assets, "project-new", new Map([["d-old", "d-new"]]), idFactory());
    expect(restored.universes[0]).toMatchObject({ id: "new-1", projectId: "project-new", homeConversationId: "new-2" });
    expect(restored.conversations[0]).toMatchObject({ id: "new-2", universeId: "new-1" });
    expect(restored.messages[0]).toMatchObject({ id: "new-3", universeId: "new-1", conversationId: "new-2", content: message.content });
    expect(restored.relationships[0]).toMatchObject({ id: "new-4", universeId: "new-1" });
    expect(restored.relationships[0].history[0]).toMatchObject({ id: "new-6", relationshipId: "new-4", universeId: "new-1", sourceMessageIds: ["new-3"] });
    expect(restored.characterStates[0]).toMatchObject({ id: "new-5", universeId: "new-1", sourceMessageIds: ["new-3"], assetRefs: ["drawing:d-new"], relationshipStateRefs: ["new-4", "new-6"] });
    expect(JSON.stringify(restored)).not.toContain('"u-old"');
    expect(JSON.stringify(restored)).not.toContain('"m-old"');
  });

  it("preserves backwards compatibility with packages that predate universe history", () => {
    expect(rehomeUniversePackage({}, "project-new")).toEqual({ universes: [], conversations: [], messages: [], relationships: [], characterStates: [] });
  });

  it("refuses to import relationship continuity when its source message is missing", () => {
    const assets = serializeUniversePackage({ ...data, messages: [] });
    expect(() => rehomeUniversePackage(assets, "project-new", new Map([["d-old", "d-new"]]), idFactory())).toThrow(/missing chat-message evidence/);
  });

  it("refuses universe children without an owning universe", () => {
    expect(() => rehomeUniversePackage({ [UNIVERSE_PACKAGE_KEYS.conversations]: JSON.stringify([conversation]) }, "project-new")).toThrow(/without its owning universe/);
  });
});
