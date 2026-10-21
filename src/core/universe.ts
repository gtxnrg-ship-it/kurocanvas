/**
 * Kuro's isolation boundary.
 *
 * A newly created chat receives its own universe by default. Additional chats can
 * join an existing universe only through an explicit user action. Every canon fact,
 * memory, asset, message, and AI task must carry this universeId before it is usable.
 */
export type UniverseLifecycle = "active" | "archived";
export type ConversationLifecycle = "active" | "archived";
export type ChatMessageRole = "user" | "kuro" | "system";
export type ChatMessageStatus = "complete" | "pending" | "failed" | "cancelled";

export interface UniverseRecord {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lifecycle: UniverseLifecycle;
  /** Project containing this universe's studio assets; never a global active-project pointer. */
  projectId: string;
  /** Stable default conversation created alongside the universe. */
  homeConversationId: string;
  /** A namespace, not a prompt: storage and retrieval must filter by this exact ID. */
  isolation: "strict";
  metadata: Record<string, unknown>;
}

export interface ChatMessageRecord {
  id: string;
  universeId: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  status: ChatMessageStatus;
  /** IDs of explicitly approved tools/actions, not untrusted model-authored prose. */
  approvedActionIds: string[];
  metadata: Record<string, unknown>;
}

export interface ConversationRecord {
  schemaVersion: 1;
  id: string;
  universeId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lifecycle: ConversationLifecycle;
  metadata: Record<string, unknown>;
}

export interface ChatUniverseBundle {
  universe: UniverseRecord;
  homeConversation: ConversationRecord;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

/** Create an independent universe and its first chat. This is the default New Chat path. */
export function createChatUniverse(title = "Untitled universe", projectId = newId()): ChatUniverseBundle {
  const now = nowIso();
  const universeId = newId();
  const conversationId = newId();
  const cleanTitle = title.trim() || "Untitled universe";
  const universe: UniverseRecord = {
    schemaVersion: 1,
    id: universeId,
    title: cleanTitle,
    createdAt: now,
    updatedAt: now,
    lifecycle: "active",
    projectId,
    homeConversationId: conversationId,
    isolation: "strict",
    metadata: {},
  };
  const homeConversation: ConversationRecord = {
    schemaVersion: 1,
    id: conversationId,
    universeId,
    title: "First conversation",
    createdAt: now,
    updatedAt: now,
    lifecycle: "active",
    metadata: {},
  };
  return { universe, homeConversation };
}

/** Create another conversation inside a universe only after the user chooses that universe. */
export function createConversationInUniverse(universe: UniverseRecord, title = "New conversation"): ConversationRecord {
  if (!validateUniverseRecord(universe)) throw new Error("Cannot create a conversation inside an invalid universe.");
  if (universe.lifecycle !== "active") throw new Error("Cannot add a conversation to an archived universe.");
  const now = nowIso();
  return {
    schemaVersion: 1,
    id: newId(),
    universeId: universe.id,
    title: title.trim() || "New conversation",
    createdAt: now,
    updatedAt: now,
    lifecycle: "active",
    metadata: {},
  };
}

/** Fail closed: a conversation from another universe cannot be used as context. */
export function assertConversationInUniverse(conversation: ConversationRecord, universeId: string): void {
  if (!universeId.trim() || conversation.universeId !== universeId) {
    throw new Error("Universe isolation violation: conversation belongs to a different universe.");
  }
}

/** Fail closed: messages must agree with both their conversation and universe. */
export function assertMessageScope(message: ChatMessageRecord, conversation: ConversationRecord, universeId: string): void {
  assertConversationInUniverse(conversation, universeId);
  if (message.universeId !== universeId || message.conversationId !== conversation.id) {
    throw new Error("Universe isolation violation: message scope does not match its conversation.");
  }
}

export function validateUniverseRecord(value: unknown): value is UniverseRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<UniverseRecord>;
  return item.schemaVersion === 1
    && typeof item.id === "string" && !!item.id.trim()
    && typeof item.title === "string"
    && typeof item.projectId === "string" && !!item.projectId.trim()
    && typeof item.homeConversationId === "string" && !!item.homeConversationId.trim()
    && item.isolation === "strict"
    && (item.lifecycle === "active" || item.lifecycle === "archived")
    && typeof item.createdAt === "string" && typeof item.updatedAt === "string"
    && !!item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata);
}

export function validateConversationRecord(value: unknown, expectedUniverseId?: string): value is ConversationRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ConversationRecord>;
  if (item.schemaVersion !== 1 || typeof item.id !== "string" || !item.id.trim()
    || typeof item.universeId !== "string" || !item.universeId.trim()
    || (expectedUniverseId !== undefined && item.universeId !== expectedUniverseId)
    || typeof item.title !== "string"
    || (item.lifecycle !== "active" && item.lifecycle !== "archived")
    || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string"
    || !item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)) return false;
  return true;
}

export function validateChatMessageRecord(value: unknown, conversationId?: string, universeId?: string): value is ChatMessageRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ChatMessageRecord>;
  return typeof item.id === "string" && !!item.id.trim()
    && typeof item.universeId === "string" && !!item.universeId.trim()
    && typeof item.conversationId === "string" && !!item.conversationId.trim()
    && (conversationId === undefined || item.conversationId === conversationId)
    && (universeId === undefined || item.universeId === universeId)
    && (item.role === "user" || item.role === "kuro" || item.role === "system")
    && typeof item.content === "string"
    && typeof item.createdAt === "string"
    && (item.status === "complete" || item.status === "pending" || item.status === "failed" || item.status === "cancelled")
    && Array.isArray(item.approvedActionIds) && item.approvedActionIds.every(id => typeof id === "string")
    && !!item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata);
}
