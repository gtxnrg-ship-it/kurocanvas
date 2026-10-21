import {
  validateChatMessageRecord,
  validateConversationRecord,
  validateUniverseRecord,
  type ChatMessageRecord,
  type ConversationRecord,
  type UniverseRecord,
} from "./universe";
import { validateRelationshipRecord, type RelationshipRecord } from "../canon/relationshipMemory";
import { validateCharacterEvolutionState, type CharacterEvolutionState } from "../canon/characterEvolution";

export const UNIVERSE_PACKAGE_KEYS = {
  universes: "kuro/universes.v1.json",
  conversations: "kuro/conversations.v1.json",
  messages: "kuro/chat-messages.v1.json",
  relationships: "kuro/relationships.v1.json",
  characterStates: "kuro/character-evolution.v1.json",
} as const;

export interface UniversePackageData {
  universes: UniverseRecord[];
  conversations: ConversationRecord[];
  messages: ChatMessageRecord[];
  relationships: RelationshipRecord[];
  characterStates: CharacterEvolutionState[];
}

function parseArray<T>(assets: Record<string, string>, key: string, label: string): T[] {
  const raw = assets[key];
  if (raw === undefined) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("The bundled " + label + " is not valid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("The bundled " + label + " must be a list.");
  return parsed as T[];
}

function requireUniqueIds(records: readonly { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || !record.id.trim()) throw new Error("The bundled " + label + " contains a record without an ID.");
    if (seen.has(record.id)) throw new Error("The bundled " + label + " contains duplicate ID " + record.id + ".");
    seen.add(record.id);
  }
}

function remapEvidence(ids: readonly string[], messageIdMap: ReadonlyMap<string, string>, label: string): string[] {
  return ids.map(id => {
    const mapped = messageIdMap.get(id);
    if (!mapped) throw new Error("The bundled " + label + " references missing chat-message evidence " + id + ". Refusing to import broken continuity.");
    return mapped;
  });
}

function remapKnownReference(value: string, recordMap: ReadonlyMap<string, string>, eventMap: ReadonlyMap<string, string>): string {
  const direct = recordMap.get(value) ?? eventMap.get(value);
  if (direct) return direct;
  for (const prefix of ["relationship:", "event:"]) {
    if (value.startsWith(prefix)) {
      const original = value.slice(prefix.length);
      const mapped = recordMap.get(original) ?? eventMap.get(original);
      if (mapped) return prefix + mapped;
    }
  }
  return value;
}

/**
 * Re-home all conversation and temporal canon records on import. Every object receives
 * fresh database identity and is connected only to the newly imported project's universes.
 * Broken cross-record references fail closed rather than becoming plausible-looking gaps.
 */
export function rehomeUniversePackage(
  assets: Record<string, string>,
  projectId: string,
  drawingIdMap: ReadonlyMap<string, string> = new Map(),
  idFactory: () => string = () => crypto.randomUUID(),
): UniversePackageData {
  if (!projectId.trim()) throw new Error("Choose a destination project before importing universe history.");
  const old: UniversePackageData = {
    universes: parseArray(assets, UNIVERSE_PACKAGE_KEYS.universes, "universes"),
    conversations: parseArray(assets, UNIVERSE_PACKAGE_KEYS.conversations, "conversations"),
    messages: parseArray(assets, UNIVERSE_PACKAGE_KEYS.messages, "chat messages"),
    relationships: parseArray(assets, UNIVERSE_PACKAGE_KEYS.relationships, "relationship memory"),
    characterStates: parseArray(assets, UNIVERSE_PACKAGE_KEYS.characterStates, "character evolution history"),
  };
  if (!old.universes.length && (old.conversations.length || old.messages.length || old.relationships.length || old.characterStates.length)) {
    throw new Error("The package contains universe data without its owning universe records.");
  }
  requireUniqueIds(old.universes, "universes");
  requireUniqueIds(old.conversations, "conversations");
  requireUniqueIds(old.messages, "chat messages");
  requireUniqueIds(old.relationships, "relationship records");
  requireUniqueIds(old.characterStates, "character evolution states");

  const universeById = new Map(old.universes.map(record => [record.id, record]));
  const conversationById = new Map(old.conversations.map(record => [record.id, record]));
  const messageById = new Map(old.messages.map(record => [record.id, record]));
  for (const universe of old.universes) {
    if (!validateUniverseRecord(universe)) throw new Error("The bundled universe " + universe.id + " is invalid.");
    if (!conversationById.has(universe.homeConversationId)) throw new Error("The bundled universe " + universe.id + " is missing its home conversation.");
    if (conversationById.get(universe.homeConversationId)?.universeId !== universe.id) throw new Error("The bundled universe's home conversation belongs to another universe.");
  }
  for (const conversation of old.conversations) {
    if (!universeById.has(conversation.universeId) || !validateConversationRecord(conversation, conversation.universeId)) {
      throw new Error("The bundled conversation " + conversation.id + " is invalid or has no bundled universe.");
    }
  }
  for (const message of old.messages) {
    const conversation = conversationById.get(message.conversationId);
    if (!conversation || conversation.universeId !== message.universeId
      || !validateChatMessageRecord(message, message.conversationId, message.universeId)) {
      throw new Error("The bundled chat message " + message.id + " is invalid or belongs to a different conversation.");
    }
  }
  for (const record of old.relationships) {
    if (!universeById.has(record.universeId) || !validateRelationshipRecord(record, record.universeId)) {
      throw new Error("The bundled relationship record " + record.id + " is invalid or has no bundled universe.");
    }
  }
  for (const state of old.characterStates) {
    if (!universeById.has(state.universeId) || validateCharacterEvolutionState(state, state.universeId).length) {
      throw new Error("The bundled character evolution state " + state.id + " is invalid or has no bundled universe.");
    }
  }

  const universeIdMap = new Map(old.universes.map(record => [record.id, idFactory()]));
  const conversationIdMap = new Map(old.conversations.map(record => [record.id, idFactory()]));
  const messageIdMap = new Map(old.messages.map(record => [record.id, idFactory()]));
  const relationshipIdMap = new Map(old.relationships.map(record => [record.id, idFactory()]));
  const characterStateIdMap = new Map(old.characterStates.map(record => [record.id, idFactory()]));
  const oldEventIds = old.relationships.flatMap(record => record.history.map(event => event.id));
  if (new Set(oldEventIds).size !== oldEventIds.length) throw new Error("The bundled relationship history contains duplicate event IDs.");
  const eventIdMap = new Map(oldEventIds.map(id => [id, idFactory()]));

  const universes = old.universes.map(record => ({
    ...record,
    id: universeIdMap.get(record.id)!,
    projectId,
    homeConversationId: conversationIdMap.get(record.homeConversationId)!,
    updatedAt: new Date().toISOString(),
  }));
  const conversations = old.conversations.map(record => ({
    ...record, id: conversationIdMap.get(record.id)!, universeId: universeIdMap.get(record.universeId)!,
    updatedAt: new Date().toISOString(),
  }));
  const messages = old.messages.map(record => ({
    ...record, id: messageIdMap.get(record.id)!, universeId: universeIdMap.get(record.universeId)!,
    conversationId: conversationIdMap.get(record.conversationId)!,
  }));
  const relationships = old.relationships.map(record => ({
    ...record,
    id: relationshipIdMap.get(record.id)!,
    universeId: universeIdMap.get(record.universeId)!,
    history: record.history.map(event => ({
      ...event,
      id: eventIdMap.get(event.id)!,
      universeId: universeIdMap.get(record.universeId)!,
      relationshipId: relationshipIdMap.get(record.id)!,
      sourceMessageIds: remapEvidence(event.sourceMessageIds, messageIdMap, "relationship history"),
    })),
  }));
  const characterStates = old.characterStates.map(state => {
    const nextPreviousStateId = state.previousStateId === undefined ? undefined : characterStateIdMap.get(state.previousStateId);
    if (state.previousStateId && !nextPreviousStateId) throw new Error("Character evolution history references a missing prior state " + state.previousStateId + ".");
    return {
      ...state,
      id: characterStateIdMap.get(state.id)!,
      universeId: universeIdMap.get(state.universeId)!,
      ...(nextPreviousStateId ? { previousStateId: nextPreviousStateId } : { previousStateId: undefined }),
      sourceMessageIds: remapEvidence(state.sourceMessageIds, messageIdMap, "character evolution history"),
      relationshipStateRefs: state.relationshipStateRefs.map(ref => remapKnownReference(ref, relationshipIdMap, eventIdMap)),
      assetRefs: state.assetRefs.map(ref => {
        if (!ref.startsWith("drawing:")) return ref;
        const oldId = ref.slice("drawing:".length);
        const nextId = drawingIdMap.get(oldId);
        if (!nextId) throw new Error("Character evolution history references missing drawing " + oldId + ". Refusing to import broken visual continuity.");
        return "drawing:" + nextId;
      }),
    };
  });

  return { universes, conversations, messages, relationships, characterStates };
}

/** Encode the five related record collections as versioned package assets. */
export function serializeUniversePackage(data: UniversePackageData): Record<string, string> {
  return {
    [UNIVERSE_PACKAGE_KEYS.universes]: JSON.stringify(data.universes),
    [UNIVERSE_PACKAGE_KEYS.conversations]: JSON.stringify(data.conversations),
    [UNIVERSE_PACKAGE_KEYS.messages]: JSON.stringify(data.messages),
    [UNIVERSE_PACKAGE_KEYS.relationships]: JSON.stringify(data.relationships),
    [UNIVERSE_PACKAGE_KEYS.characterStates]: JSON.stringify(data.characterStates),
  };
}
