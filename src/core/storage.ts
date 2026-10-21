import { validateProject, type KuroProject, type ProjectTemplate } from "./project";
import { validateCanon, type CanonBundle } from "../canon/universe";
import { validateStoryMemoryRecord, type StoryMemoryRecord } from "../canon/storyMemory";
import { validateArtDirection, type ArtDirectionBible } from "../canon/artDirection";
import { validateStyleBible, type ProjectStyleBible } from "../canon/styleBible";
import { validateReferenceSource, type ReferenceSourceRecord } from "../canon/referenceScout";
import { validateCharacterModel, type CharacterModelRecord } from "../canon/characterModels";
import { validateRelationshipRecord, type RelationshipRecord } from "../canon/relationshipMemory";
import {
  validateUniverseRecord,
  validateConversationRecord,
  validateChatMessageRecord,
  type UniverseRecord,
  type ConversationRecord,
  type ChatMessageRecord,
  type ChatUniverseBundle,
} from "./universe";

const DB_NAME = "kuro-canvas-local";
const DB_VERSION = 11;
const PROJECTS = "projects";
const TEMPLATES = "templates";
const AUTOSAVE = "autosave";
const DRAWINGS = "drawings";
const DRAWING_REVISIONS = "drawingRevisions";
const CANON = "canon";
const STORY_MEMORY = "storyMemory";
const ART_DIRECTION = "artDirection";
const STYLE_BIBLE = "styleBible";
const REFERENCE_SOURCES = "referenceSources";
const CHARACTER_MODELS = "characterModels";
const UNIVERSES = "universes";
const CONVERSATIONS = "conversations";
const CHAT_MESSAGES = "chatMessages";
const RELATIONSHIPS = "relationships";
const DB_UNAVAILABLE = "Local project storage is unavailable in this browser context.";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error(DB_UNAVAILABLE));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(TEMPLATES)) db.createObjectStore(TEMPLATES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(AUTOSAVE)) db.createObjectStore(AUTOSAVE, { keyPath: "projectId" });
      if (!db.objectStoreNames.contains(DRAWINGS)) db.createObjectStore(DRAWINGS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DRAWING_REVISIONS)) db.createObjectStore(DRAWING_REVISIONS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CANON)) db.createObjectStore(CANON, { keyPath: "projectId" });
      if (!db.objectStoreNames.contains(STORY_MEMORY)) db.createObjectStore(STORY_MEMORY, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ART_DIRECTION)) db.createObjectStore(ART_DIRECTION, { keyPath: "projectId" });
      if (!db.objectStoreNames.contains(STYLE_BIBLE)) db.createObjectStore(STYLE_BIBLE, { keyPath: "projectId" });
      if (!db.objectStoreNames.contains(REFERENCE_SOURCES)) db.createObjectStore(REFERENCE_SOURCES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHARACTER_MODELS)) db.createObjectStore(CHARACTER_MODELS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(UNIVERSES)) db.createObjectStore(UNIVERSES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CONVERSATIONS)) {
        const conversations = db.createObjectStore(CONVERSATIONS, { keyPath: "id" });
        conversations.createIndex("byUniverseId", "universeId", { unique: false });
      }
      if (!db.objectStoreNames.contains(CHAT_MESSAGES)) {
        const messages = db.createObjectStore(CHAT_MESSAGES, { keyPath: "id" });
        messages.createIndex("byUniverseId", "universeId", { unique: false });
        messages.createIndex("byConversationId", "conversationId", { unique: false });
      }
      if (!db.objectStoreNames.contains(RELATIONSHIPS)) {
        const relationships = db.createObjectStore(RELATIONSHIPS, { keyPath: "id" });
        relationships.createIndex("byUniverseId", "universeId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local project database."));
    request.onblocked = () => reject(new Error("Close other Kuro Canvas tabs to finish a local database upgrade."));
  });
}

async function requestValue<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      let result: T;
      let hasResult = false;
      request.onsuccess = () => { result = request.result; hasResult = true; };
      request.onerror = () => reject(request.error ?? new Error("Local storage operation failed."));
      tx.oncomplete = () => {
        if (hasResult) resolve(result);
        else reject(new Error("Local storage transaction completed without a result."));
      };
      tx.onerror = () => reject(tx.error ?? new Error("Local storage transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Local storage transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export const projectStorage = {
  async save(project: KuroProject): Promise<void> {
    if (!validateProject(project)) throw new Error("Refusing to save an invalid Kuro project.");
    const snapshot = { ...project, updatedAt: new Date().toISOString() };
    await requestValue<IDBValidKey>(PROJECTS, "readwrite", store => store.put(snapshot));
  },
  async load(id: string): Promise<KuroProject | undefined> {
    const result = await requestValue<KuroProject | undefined>(PROJECTS, "readonly", store => store.get(id));
    if (result && !validateProject(result)) throw new Error("This project uses an unsupported or damaged project schema.");
    return result;
  },
  async list(): Promise<Array<Pick<KuroProject, "id" | "name" | "createdAt" | "updatedAt">>> {
    const projects = await requestValue<KuroProject[]>(PROJECTS, "readonly", store => store.getAll());
    return projects.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async remove(id: string): Promise<void> {
    const memoryRecords = await requestValue<StoryMemoryRecord[]>(STORY_MEMORY, "readonly", store => store.getAll());
    const referenceRecords = await requestValue<ReferenceSourceRecord[]>(REFERENCE_SOURCES, "readonly", store => store.getAll());
    const characterModels = await requestValue<CharacterModelRecord[]>(CHARACTER_MODELS, "readonly", store => store.getAll());
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([PROJECTS, AUTOSAVE, CANON, STORY_MEMORY, ART_DIRECTION, STYLE_BIBLE, REFERENCE_SOURCES, CHARACTER_MODELS], "readwrite");
        tx.objectStore(PROJECTS).delete(id);
        tx.objectStore(AUTOSAVE).delete(id);
        tx.objectStore(CANON).delete(id);
        tx.objectStore(ART_DIRECTION).delete(id);
        tx.objectStore(STYLE_BIBLE).delete(id);
        const referenceStore = tx.objectStore(REFERENCE_SOURCES);
        for (const record of referenceRecords) if (record.projectId === id) referenceStore.delete(record.id);
        const characterModelStore = tx.objectStore(CHARACTER_MODELS);
        for (const record of characterModels) if (record.projectId === id) characterModelStore.delete(record.id);
        const memoryStore = tx.objectStore(STORY_MEMORY);
        for (const record of memoryRecords) if (record.projectId === id) memoryStore.delete(record.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not remove project."));
        tx.onabort = () => reject(tx.error ?? new Error("Project removal was cancelled."));
      });
    } finally {
      db.close();
    }
  },
  async saveAutosave(project: KuroProject): Promise<void> {
    if (!validateProject(project)) throw new Error("Refusing to autosave an invalid Kuro project.");
    await requestValue<IDBValidKey>(AUTOSAVE, "readwrite", store => store.put({
      projectId: project.id, savedAt: new Date().toISOString(), snapshot: project,
    }));
  },
  async loadAutosave(projectId: string): Promise<KuroProject | undefined> {
    const record = await requestValue<{ snapshot: unknown } | undefined>(AUTOSAVE, "readonly", store => store.get(projectId));
    if (!record) return undefined;
    if (!validateProject(record.snapshot)) throw new Error("The recovery snapshot is invalid.");
    return record.snapshot;
  },
};

export interface LocalDrawingDocument {
  id: string;
  name?: string;
  version: 1;
  width: number;
  height: number;
  background: string;
  layers?: Array<{ id: string; name: string; visible: boolean; locked: boolean; opacity?: number; blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' }>;
  strokes: Array<{
    id: string;
    layerId?: string;
    tool: "brush" | "eraser";
    shape?: "line" | "rectangle" | "ellipse" | "text" | "panel" | "bubble" | "image";
    imageDataUrl?: string;
    imageName?: string;
    text?: string;
    fontFamily?: "comic" | "sans" | "serif";
    fillColor?: string;
    filled?: boolean;
    rotation?: number;
    brushPreset?: "ink" | "pencil" | "marker" | "airbrush" | "watercolor" | "dry-brush" | "calligraphy";
    color: string;
    size: number;
    points: Array<{ x: number; y: number; pressure: number }>;
  }>;
  updatedAt: string;
}

export interface DrawingRevision {
  id: string;
  drawingId: string;
  title: string;
  createdAt: string;
  document: LocalDrawingDocument;
}

/** Named, immutable checkpoints separate from the current autosaved drawing. */
export const drawingRevisionStorage = {
  async create(drawingId: string, title: string, document: LocalDrawingDocument): Promise<DrawingRevision> {
    if (!drawingId.trim() || !title.trim() || document.version !== 1 || !Array.isArray(document.strokes)) {
      throw new Error("A version checkpoint needs a drawing, title, and valid document.");
    }
    const createdAt = new Date().toISOString();
    const revision: DrawingRevision = {
      id: crypto.randomUUID(), drawingId, title: title.trim(), createdAt,
      document: JSON.parse(JSON.stringify({ ...document, id: drawingId, updatedAt: createdAt })) as LocalDrawingDocument,
    };
    await requestValue<IDBValidKey>(DRAWING_REVISIONS, "readwrite", store => store.put(revision));
    const all = await requestValue<DrawingRevision[]>(DRAWING_REVISIONS, "readonly", store => store.getAll());
    const older = all.filter(item => item.drawingId === drawingId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(20);
    for (const item of older) await requestValue<undefined>(DRAWING_REVISIONS, "readwrite", store => store.delete(item.id));
    return revision;
  },
  async list(drawingId: string): Promise<Array<Omit<DrawingRevision, "document">>> {
    const all = await requestValue<DrawingRevision[]>(DRAWING_REVISIONS, "readonly", store => store.getAll());
    return all.filter(item => item.drawingId === drawingId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ document: _document, ...meta }) => meta);
  },
  async load(revisionId: string, drawingId: string): Promise<DrawingRevision | undefined> {
    const revision = await requestValue<DrawingRevision | undefined>(DRAWING_REVISIONS, "readonly", store => store.get(revisionId));
    if (!revision || revision.drawingId !== drawingId) return undefined;
    if (revision.document.version !== 1 || !Array.isArray(revision.document.strokes)) throw new Error("This drawing version is damaged or unsupported.");
    return revision;
  },
  async removeDrawing(drawingId: string): Promise<void> {
    const all = await requestValue<DrawingRevision[]>(DRAWING_REVISIONS, "readonly", store => store.getAll());
    for (const revision of all) if (revision.drawingId === drawingId) await requestValue<undefined>(DRAWING_REVISIONS, "readwrite", store => store.delete(revision.id));
  },
};

/** Durable, device-local drawing documents. Writes complete before the promise resolves. */
export const drawingStorage = {
  async save(document: LocalDrawingDocument): Promise<void> {
    if (!document.id || document.version !== 1 || !Number.isFinite(document.width) || !Number.isFinite(document.height) || !Array.isArray(document.strokes)) {
      throw new Error("Refusing to save an invalid drawing document.");
    }
    await requestValue<IDBValidKey>(DRAWINGS, "readwrite", store => store.put({ ...document, updatedAt: new Date().toISOString() }));
  },
  async load(id: string): Promise<LocalDrawingDocument | undefined> {
    const result = await requestValue<LocalDrawingDocument | undefined>(DRAWINGS, "readonly", store => store.get(id));
    if (result && (result.version !== 1 || !Array.isArray(result.strokes) || !Number.isFinite(result.width) || !Number.isFinite(result.height))) {
      throw new Error("This saved drawing is damaged or uses an unsupported version.");
    }
    return result;
  },
  async list(): Promise<Array<Pick<LocalDrawingDocument, "id" | "name" | "updatedAt">>> {
    const documents = await requestValue<LocalDrawingDocument[]>(DRAWINGS, "readonly", store => store.getAll());
    return documents.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async remove(id: string): Promise<void> {
    await requestValue<undefined>(DRAWINGS, "readwrite", store => store.delete(id));
    await drawingRevisionStorage.removeDrawing(id);
  },
};

export const templateVault = {
  async save(template: ProjectTemplate): Promise<void> {
    if (!template.id || !template.name.trim() || !Number.isInteger(template.version) || template.version < 1) {
      throw new Error("A template needs an ID, name, and positive integer version.");
    }
    await requestValue<IDBValidKey>(TEMPLATES, "readwrite", store => store.put(template));
  },
  get(id: string): Promise<ProjectTemplate | undefined> {
    return requestValue<ProjectTemplate | undefined>(TEMPLATES, "readonly", store => store.get(id));
  },
  async list(): Promise<ProjectTemplate[]> {
    const items = await requestValue<ProjectTemplate[]>(TEMPLATES, "readonly", store => store.getAll());
    return items.sort((a, b) => a.name.localeCompare(b.name));
  },
  async remove(id: string): Promise<void> {
    await requestValue<undefined>(TEMPLATES, "readwrite", store => store.delete(id));
  },
};

/** Explicit JSON interchange for debugging/backup; .kuro ZIP packaging is a separate layer. */
export function exportProjectJson(project: KuroProject): string {
  if (!validateProject(project)) throw new Error("Cannot export an invalid Kuro project.");
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(text: string): KuroProject {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  if (!validateProject(parsed)) throw new Error("This JSON is not a supported Kuro project (schema version 1).");
  return parsed;
}


/** Project-scoped universe memory. Stored separately from chat transcripts and drawings. */
export const canonStorage = {
  async save(bundle: CanonBundle): Promise<void> {
    if (!bundle.projectId || bundle.schemaVersion !== 1 || !Array.isArray(bundle.entities) || !Array.isArray(bundle.facts)) {
      throw new Error("Refusing to save an invalid canon bundle.");
    }
    const errors = validateCanon(bundle).filter(issue => issue.severity === "error");
    if (errors.length) throw new Error("Canon validation failed: " + errors.map(issue => issue.message).join(" "));
    await requestValue<IDBValidKey>(CANON, "readwrite", store => store.put({ ...bundle, updatedAt: new Date().toISOString() }));
  },
  async load(projectId: string): Promise<CanonBundle | undefined> {
    const result = await requestValue<(CanonBundle & { updatedAt?: string }) | undefined>(CANON, "readonly", store => store.get(projectId));
    if (!result) return undefined;
    const errors = validateCanon(result).filter(issue => issue.severity === "error");
    if (errors.length) throw new Error("Saved canon is invalid: " + errors.map(issue => issue.message).join(" "));
    return { schemaVersion: result.schemaVersion, projectId: result.projectId, entities: result.entities, facts: result.facts };
  },
  async remove(projectId: string): Promise<void> {
    await requestValue<undefined>(CANON, "readwrite", store => store.delete(projectId));
  },
};


/** Durable chapter/event/character-change memory, scoped to a project. */
/** One strict art-direction contract per project; never shared across series. */
/** Temporal visual canon: approved character states and inspirations are chapter-aware. */
/** Source-linked visual references with license and attribution metadata. */
/** Local GLB models and chapter-linked scar overlays. */
export const characterModelStorage = {
  async save(record: CharacterModelRecord): Promise<void> {
    const errors = validateCharacterModel(record, record.projectId);
    if (errors.length) throw new Error("Character model validation failed: " + errors.join(" "));
    await requestValue<IDBValidKey>(CHARACTER_MODELS, "readwrite", store => store.put({ ...record, updatedAt: new Date().toISOString() }));
  },
  async list(projectId: string): Promise<CharacterModelRecord[]> {
    if (!projectId.trim()) throw new Error("Choose a project before loading character models.");
    const records = await requestValue<CharacterModelRecord[]>(CHARACTER_MODELS, "readonly", store => store.getAll());
    const scoped = records.filter(record => record.projectId === projectId);
    for (const record of scoped) {
      const errors = validateCharacterModel(record, projectId);
      if (errors.length) throw new Error("Saved character model is invalid: " + errors.join(" "));
    }
    return scoped.sort((a,b) => a.characterName.localeCompare(b.characterName) || (a.storyOrder ?? 0) - (b.storyOrder ?? 0));
  },
  async load(id: string, projectId: string): Promise<CharacterModelRecord | undefined> {
    const record = await requestValue<CharacterModelRecord | undefined>(CHARACTER_MODELS, "readonly", store => store.get(id));
    if (!record || record.projectId !== projectId) return undefined;
    const errors = validateCharacterModel(record, projectId);
    if (errors.length) throw new Error("Saved character model is invalid: " + errors.join(" "));
    return record;
  },
  async remove(id: string, projectId: string): Promise<void> {
    const record = await requestValue<CharacterModelRecord | undefined>(CHARACTER_MODELS, "readonly", store => store.get(id));
    if (record && record.projectId !== projectId) throw new Error("Cannot remove a model from another project.");
    await requestValue<undefined>(CHARACTER_MODELS, "readwrite", store => store.delete(id));
  },
};


export const referenceSourceStorage = {
  async save(record: ReferenceSourceRecord): Promise<void> {
    const errors = validateReferenceSource(record, record.projectId);
    if (errors.length) throw new Error("Reference source validation failed: " + errors.join(" "));
    await requestValue<IDBValidKey>(REFERENCE_SOURCES, "readwrite", store => store.put({ ...record, updatedAt: new Date().toISOString() }));
  },
  async list(projectId: string): Promise<ReferenceSourceRecord[]> {
    if (!projectId.trim()) throw new Error("Choose a project before loading references.");
    const records = await requestValue<ReferenceSourceRecord[]>(REFERENCE_SOURCES, "readonly", store => store.getAll());
    const scoped = records.filter(record => record.projectId === projectId);
    for (const record of scoped) {
      const errors = validateReferenceSource(record, projectId);
      if (errors.length) throw new Error("Saved reference source is invalid: " + errors.join(" "));
    }
    return scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async remove(id: string, projectId: string): Promise<void> {
    const record = await requestValue<ReferenceSourceRecord | undefined>(REFERENCE_SOURCES, "readonly", store => store.get(id));
    if (record && record.projectId !== projectId) throw new Error("Cannot remove a reference from another project.");
    await requestValue<undefined>(REFERENCE_SOURCES, "readwrite", store => store.delete(id));
  },
};


export const styleBibleStorage = {
  async save(bible: ProjectStyleBible): Promise<void> {
    const errors = validateStyleBible(bible, bible.projectId);
    if (errors.length) throw new Error("Style bible validation failed: " + errors.join(" "));
    await requestValue<IDBValidKey>(STYLE_BIBLE, "readwrite", store => store.put({ ...bible, updatedAt: new Date().toISOString() }));
  },
  async load(projectId: string): Promise<ProjectStyleBible | undefined> {
    if (!projectId.trim()) throw new Error("Choose a project before loading its style bible.");
    const result = await requestValue<ProjectStyleBible | undefined>(STYLE_BIBLE, "readonly", store => store.get(projectId));
    if (!result) return undefined;
    const errors = validateStyleBible(result, projectId);
    if (errors.length) throw new Error("Saved style bible is invalid: " + errors.join(" "));
    return result;
  },
  async remove(projectId: string): Promise<void> {
    await requestValue<undefined>(STYLE_BIBLE, "readwrite", store => store.delete(projectId));
  },
};


export const artDirectionStorage = {
  async save(bible: ArtDirectionBible): Promise<void> {
    const errors = validateArtDirection(bible, bible.projectId);
    if (errors.length) throw new Error("Art direction validation failed: " + errors.join(" "));
    await requestValue<IDBValidKey>(ART_DIRECTION, "readwrite", store => store.put({ ...bible, updatedAt: new Date().toISOString() }));
  },
  async load(projectId: string): Promise<ArtDirectionBible | undefined> {
    if (!projectId.trim()) throw new Error("Choose a project before loading art direction.");
    const result = await requestValue<ArtDirectionBible | undefined>(ART_DIRECTION, "readonly", store => store.get(projectId));
    if (!result) return undefined;
    const errors = validateArtDirection(result, projectId);
    if (errors.length) throw new Error("Saved art direction is invalid: " + errors.join(" "));
    return result;
  },
  async remove(projectId: string): Promise<void> {
    await requestValue<undefined>(ART_DIRECTION, "readwrite", store => store.delete(projectId));
  },
};


export const storyMemoryStorage = {
  async save(record: StoryMemoryRecord): Promise<void> {
    const errors = validateStoryMemoryRecord(record, record.projectId);
    if (errors.length) throw new Error("Story memory validation failed: " + errors.join(" "));
    await requestValue<IDBValidKey>(STORY_MEMORY, "readwrite", store => store.put({ ...record, updatedAt: new Date().toISOString() }));
  },
  async list(projectId: string): Promise<StoryMemoryRecord[]> {
    if (!projectId.trim()) throw new Error("Choose a project before loading story memory.");
    const records = await requestValue<StoryMemoryRecord[]>(STORY_MEMORY, "readonly", store => store.getAll());
    const scoped = records.filter(record => record.projectId === projectId);
    for (const record of scoped) {
      const errors = validateStoryMemoryRecord(record, projectId);
      if (errors.length) throw new Error("Saved story memory is invalid: " + errors.join(" "));
    }
    return scoped.sort((a, b) => (a.storyOrder ?? -1) - (b.storyOrder ?? -1) || a.updatedAt.localeCompare(b.updatedAt));
  },
  async remove(id: string, projectId: string): Promise<void> {
    const existing = await requestValue<StoryMemoryRecord | undefined>(STORY_MEMORY, "readonly", store => store.get(id));
    if (existing && existing.projectId !== projectId) throw new Error("Cannot delete story memory from another project.");
    await requestValue<undefined>(STORY_MEMORY, "readwrite", store => store.delete(id));
  },
  async removeProject(projectId: string): Promise<void> {
    const records = await this.list(projectId);
    if (!records.length) return;
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORY_MEMORY, "readwrite");
        const store = tx.objectStore(STORY_MEMORY);
        for (const record of records) store.delete(record.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not remove project story memory."));
        tx.onabort = () => reject(tx.error ?? new Error("Project story memory removal was cancelled."));
      });
    } finally { db.close(); }
  },
};

/**
 * Strictly scoped chat storage. Message history is stored separately so long
 * conversations do not require rewriting a growing conversation record on every send.
 */
export const universeStorage = {
  /** Persist a new universe and its first conversation atomically. */
  async create(bundle: ChatUniverseBundle): Promise<void> {
    if (!validateUniverseRecord(bundle.universe)
      || !validateConversationRecord(bundle.homeConversation, bundle.universe.id)
      || bundle.universe.homeConversationId !== bundle.homeConversation.id) {
      throw new Error("Refusing to create an invalid chat universe bundle.");
    }
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([UNIVERSES, CONVERSATIONS], "readwrite");
        tx.objectStore(UNIVERSES).add(bundle.universe);
        tx.objectStore(CONVERSATIONS).add(bundle.homeConversation);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not create chat universe."));
        tx.onabort = () => reject(tx.error ?? new Error("Chat universe creation was cancelled."));
      });
    } finally { db.close(); }
  },
  async save(universe: UniverseRecord): Promise<void> {
    if (!validateUniverseRecord(universe)) throw new Error("Refusing to save an invalid universe.");
    await requestValue<IDBValidKey>(UNIVERSES, "readwrite", store => store.put(universe));
  },
  async load(id: string): Promise<UniverseRecord | undefined> {
    const value = await requestValue<UniverseRecord | undefined>(UNIVERSES, "readonly", store => store.get(id));
    if (value && !validateUniverseRecord(value)) throw new Error("Saved universe is invalid.");
    return value;
  },
  async list(): Promise<UniverseRecord[]> {
    const values = await requestValue<UniverseRecord[]>(UNIVERSES, "readonly", store => store.getAll());
    if (values.some(value => !validateUniverseRecord(value))) throw new Error("Saved universe collection contains invalid records.");
    return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
};

export const conversationStorage = {
  async save(conversation: ConversationRecord): Promise<void> {
    if (!validateConversationRecord(conversation)) throw new Error("Refusing to save an invalid conversation.");
    const universe = await universeStorage.load(conversation.universeId);
    if (!universe) throw new Error("Cannot save a conversation without its owning universe.");
    await requestValue<IDBValidKey>(CONVERSATIONS, "readwrite", store => store.put(conversation));
  },
  async load(id: string, universeId: string): Promise<ConversationRecord | undefined> {
    if (!universeId.trim()) throw new Error("Choose a universe before loading a conversation.");
    const value = await requestValue<ConversationRecord | undefined>(CONVERSATIONS, "readonly", store => store.get(id));
    if (value && value.universeId !== universeId) throw new Error("Universe isolation violation: conversation belongs to another universe.");
    if (value && !validateConversationRecord(value, universeId)) throw new Error("Saved conversation is invalid.");
    return value;
  },
  async list(universeId: string): Promise<ConversationRecord[]> {
    if (!universeId.trim()) throw new Error("Choose a universe before listing conversations.");
    const values = await requestValue<ConversationRecord[]>(CONVERSATIONS, "readonly", store =>
      store.index("byUniverseId").getAll(universeId));
    if (values.some(value => !validateConversationRecord(value, universeId))) {
      throw new Error("Saved conversations contain invalid or cross-universe records.");
    }
    return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async remove(id: string, universeId: string): Promise<void> {
    const existing = await this.load(id, universeId);
    if (!existing) return;
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([CONVERSATIONS, CHAT_MESSAGES], "readwrite");
        const messages = tx.objectStore(CHAT_MESSAGES).index("byConversationId");
        const request = messages.openKeyCursor(IDBKeyRange.only(id));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { tx.objectStore(CHAT_MESSAGES).delete(cursor.primaryKey); cursor.continue(); }
        };
        tx.objectStore(CONVERSATIONS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not remove conversation."));
        tx.onabort = () => reject(tx.error ?? new Error("Conversation removal was cancelled."));
      });
    } finally { db.close(); }
  },
};

export const chatMessageStorage = {
  async save(message: ChatMessageRecord): Promise<void> {
    if (!validateChatMessageRecord(message)) throw new Error("Refusing to save an invalid chat message.");
    const conversation = await conversationStorage.load(message.conversationId, message.universeId);
    if (!conversation) throw new Error("Cannot save a message without its owning conversation.");
    await requestValue<IDBValidKey>(CHAT_MESSAGES, "readwrite", store => store.put(message));
  },
  async list(universeId: string, conversationId: string): Promise<ChatMessageRecord[]> {
    if (!universeId.trim() || !conversationId.trim()) throw new Error("Choose a universe and conversation before loading messages.");
    const conversation = await conversationStorage.load(conversationId, universeId);
    if (!conversation) throw new Error("Conversation does not exist in this universe.");
    const values = await requestValue<ChatMessageRecord[]>(CHAT_MESSAGES, "readonly", store =>
      store.index("byConversationId").getAll(conversationId));
    const scoped = values.filter(value => value.universeId === universeId);
    if (scoped.some(value => !validateChatMessageRecord(value, conversationId, universeId))) {
      throw new Error("Saved messages contain invalid or cross-universe records.");
    }
    if (scoped.length !== values.length) throw new Error("Universe isolation violation: foreign messages were found in this conversation.");
    return scoped.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
};


/** Durable relationship canon, indexed and validated within one universe. */
export const relationshipStorage = {
  async save(record: RelationshipRecord): Promise<void> {
    if (!validateRelationshipRecord(record)) throw new Error("Refusing to save an invalid relationship record.");
    const universe = await universeStorage.load(record.universeId);
    if (!universe) throw new Error("Cannot save relationship memory without its owning universe.");
    await requestValue<IDBValidKey>(RELATIONSHIPS, "readwrite", store => store.put(record));
  },
  async load(id: string, universeId: string): Promise<RelationshipRecord | undefined> {
    if (!universeId.trim()) throw new Error("Choose a universe before loading relationship memory.");
    const record = await requestValue<RelationshipRecord | undefined>(RELATIONSHIPS, "readonly", store => store.get(id));
    if (record && record.universeId !== universeId) throw new Error("Universe isolation violation: relationship belongs to another universe.");
    if (record && !validateRelationshipRecord(record, universeId)) throw new Error("Saved relationship record is invalid.");
    return record;
  },
  async list(universeId: string): Promise<RelationshipRecord[]> {
    if (!universeId.trim()) throw new Error("Choose a universe before listing relationship memory.");
    const records = await requestValue<RelationshipRecord[]>(RELATIONSHIPS, "readonly", store => store.index("byUniverseId").getAll(universeId));
    if (records.some(record => !validateRelationshipRecord(record, universeId))) throw new Error("Saved relationships contain invalid or cross-universe records.");
    return records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt));
  },
};
