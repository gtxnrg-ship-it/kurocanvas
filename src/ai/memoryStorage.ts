import {
  canShareMemory,
  validateMemory,
  type EvolutionPolicy,
  type KuroMemory,
  DEFAULT_EVOLUTION_POLICY,
} from "./evolution";

const DB_NAME = "kuro-canvas-memory";
const DB_VERSION = 1;
const STORE = "memories";

function openMemoryDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Persistent Kuro memory requires browser IndexedDB support."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("scope", "scope", { unique: false });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open Kuro memory database."));
    request.onblocked = () => reject(new Error("Close other Kuro Canvas tabs to finish the memory database upgrade."));
  });
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openMemoryDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      let value: T;
      let hasValue = false;
      request.onsuccess = () => { value = request.result; hasValue = true; };
      request.onerror = () => reject(request.error ?? new Error("Kuro memory request failed."));
      tx.oncomplete = () => hasValue
        ? resolve(value)
        : reject(new Error("Kuro memory transaction completed without a result."));
      tx.onerror = () => reject(tx.error ?? new Error("Kuro memory transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Kuro memory transaction was aborted."));
    });
  } finally {
    db.close();
  }
}

export interface MemoryQuery {
  scope?: KuroMemory["scope"];
  projectId?: string;
  status?: KuroMemory["status"];
  kind?: KuroMemory["kind"];
}

export const kuroMemoryStorage = {
  async save(memory: KuroMemory, policy: EvolutionPolicy = DEFAULT_EVOLUTION_POLICY): Promise<void> {
    if (!validateMemory(memory)) throw new Error("Refusing to save invalid Kuro memory.");
    if (memory.scope === "shared" && !canShareMemory(memory, policy)) {
      throw new Error("Shared memory is disabled or has not passed approval and privacy review.");
    }
    const snapshot: KuroMemory = { ...memory, provenance: [...memory.provenance], updatedAt: new Date().toISOString() };
    await runRequest<IDBValidKey>("readwrite", store => store.put(snapshot));
  },

  async get(id: string): Promise<KuroMemory | undefined> {
    const memory = await runRequest<KuroMemory | undefined>("readonly", store => store.get(id));
    if (memory && !validateMemory(memory)) throw new Error("Stored Kuro memory failed validation.");
    return memory;
  },

  async list(query: MemoryQuery = {}): Promise<KuroMemory[]> {
    const all = await runRequest<KuroMemory[]>("readonly", store => store.getAll());
    return all.filter(memory =>
      validateMemory(memory)
      && (query.scope === undefined || memory.scope === query.scope)
      && (query.projectId === undefined || memory.projectId === query.projectId)
      && (query.status === undefined || memory.status === query.status)
      && (query.kind === undefined || memory.kind === query.kind),
    );
  },

  async remove(id: string): Promise<void> {
    await runRequest<undefined>("readwrite", store => store.delete(id));
  },

  async updateStatus(id: string, status: KuroMemory["status"]): Promise<KuroMemory> {
    const existing = await this.get(id);
    if (!existing) throw new Error("Unknown Kuro memory: " + id);
    const updated: KuroMemory = { ...existing, status, updatedAt: new Date().toISOString() };
    await this.save(updated, {
      ...DEFAULT_EVOLUTION_POLICY,
      // Status changes to existing shared memories still require the caller to supply the shared policy explicitly via save().
      sharedLearningEnabled: updated.scope === "shared" ? false : DEFAULT_EVOLUTION_POLICY.sharedLearningEnabled,
    });
    return updated;
  },
};
