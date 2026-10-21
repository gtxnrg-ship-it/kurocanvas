import { describe, expect, it } from "vitest";
import {
  assertConversationInUniverse,
  assertMessageScope,
  createChatUniverse,
  createConversationInUniverse,
  validateChatMessageRecord,
  validateConversationRecord,
  validateUniverseRecord,
  validateUniverseProjectPartition,
  type ChatMessageRecord,
} from "./universe";

describe("chat universe isolation", () => {
  it("gives every new chat its own independent universe by default", () => {
    const first = createChatUniverse("Rain City");
    const second = createChatUniverse("The Ashen Crown");
    expect(first.universe.id).not.toBe(second.universe.id);
    expect(first.homeConversation.universeId).toBe(first.universe.id);
    expect(second.homeConversation.universeId).toBe(second.universe.id);
    expect(first.universe.projectId).not.toBe(second.universe.projectId);
    expect(validateUniverseRecord(first.universe)).toBe(true);
    expect(validateConversationRecord(first.homeConversation, first.universe.id)).toBe(true);
  });

  it("only creates a shared-universe conversation when explicitly given that universe", () => {
    const bundle = createChatUniverse("One world");
    const followup = createConversationInUniverse(bundle.universe, "Chapter planning");
    expect(followup.universeId).toBe(bundle.universe.id);
    expect(followup.id).not.toBe(bundle.homeConversation.id);
  });

  it("fails closed when a conversation is used with another universe", () => {
    const a = createChatUniverse("A");
    const b = createChatUniverse("B");
    expect(() => assertConversationInUniverse(a.homeConversation, b.universe.id))
      .toThrow(/isolation violation/i);
  });

  it("rejects a message whose scope disagrees with the conversation", () => {
    const bundle = createChatUniverse("Scope test");
    const message: ChatMessageRecord = {
      id: "message-1",
      universeId: "wrong-universe",
      conversationId: bundle.homeConversation.id,
      role: "user",
      content: "Do not leak context",
      createdAt: new Date().toISOString(),
      status: "complete",
      approvedActionIds: [],
      metadata: {},
    };
    expect(validateChatMessageRecord(message, bundle.homeConversation.id, bundle.universe.id)).toBe(false);
    expect(() => assertMessageScope(message, bundle.homeConversation, bundle.universe.id))
      .toThrow(/isolation violation/i);
  });

  it("rejects malformed records and archived-universe writes", () => {
    expect(validateUniverseRecord({ id: "missing-schema" })).toBe(false);
    const bundle = createChatUniverse("Archived");
    bundle.universe.lifecycle = "archived";
    expect(() => createConversationInUniverse(bundle.universe)).toThrow(/archived/i);
  });
});


describe("universe-to-project isolation partition", () => {
  it("allows exactly one universe to own a project", () => {
    const one = createChatUniverse("Rain City", "project-a").universe;
    const otherProject = createChatUniverse("Ashen Crown", "project-b").universe;
    expect(validateUniverseProjectPartition([one, otherProject])).toEqual([]);
  });

  it("rejects two independent universes sharing the same project memory boundary", () => {
    const one = createChatUniverse("Rain City", "project-a").universe;
    const two = createChatUniverse("Ashen Crown", "project-a").universe;
    expect(one.id).not.toBe(two.id);
    expect(validateUniverseProjectPartition([one, two])).toContain(
      "A project cannot own multiple isolated universes. Create a separate project for each universe to keep story memory and canon isolated.",
    );
  });

  it("does not report the same universe twice as a separate owner", () => {
    const one = createChatUniverse("Rain City", "project-a").universe;
    expect(validateUniverseProjectPartition([one, { ...one }])).toEqual([]);
  });
});
