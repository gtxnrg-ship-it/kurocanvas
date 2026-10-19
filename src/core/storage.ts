import { validateProject, type KuroProject, type ProjectTemplate } from "./project";
import { validateCanon, type CanonBundle } from "../canon/universe";

const DB_NAME = "kuro-canvas-local";
const DB_VERSION = 3;
const PROJECTS = "projects";
const TEMPLATES = "templates";
const AUTOSAVE = "autosave";
const DRAWINGS = "drawings";
const CANON = "canon";
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
      if (!db.objectStoreNames.contains(CANON)) db.createObjectStore(CANON, { keyPath: "projectId" });
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
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([PROJECTS, AUTOSAVE], "readwrite");
        tx.objectStore(PROJECTS).delete(id);
        tx.objectStore(AUTOSAVE).delete(id);
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
    color: string;
    size: number;
    points: Array<{ x: number; y: number; pressure: number }>;
  }>;
  updatedAt: string;
}

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
