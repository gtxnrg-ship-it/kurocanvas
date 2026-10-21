export type ResearchDepth = "quick" | "balanced" | "deep" | "exhaustive";
export type ResearchSourceProvider = "wikipedia" | "crossref";
export type ResearchTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ResearchSource {
  title: string;
  url: string;
  extract: string;
}

export interface ResearchTaskRecord {
  id: string;
  projectId: string;
  query: string;
  depth: ResearchDepth;
  /** Optional only for backwards compatibility with older saved research jobs. */
  sourceProvider?: ResearchSourceProvider;
  status: ResearchTaskStatus;
  progress: number;
  stage: string;
  sources: ResearchSource[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  leaseUntil?: number;
  error?: string;
}

const DB_NAME = "kurocanvas-background-research";
const DB_VERSION = 1;
const STORE = "tasks";
export const RESEARCH_QUEUE_CHANGED = "kuro-research-queue-changed";
const SEARCH_LIMIT: Record<ResearchDepth, number> = { quick: 3, balanced: 5, deep: 8, exhaustive: 12 };
const EXTRACT_CHARS: Record<ResearchDepth, number> = { quick: 1000, balanced: 1700, deep: 2300, exhaustive: 3000 };

type TaskEventListener = () => void;
let paused = false;
let runnerStarted = false;
let pumping = false;
let activeTaskId: string | undefined;
let activeResearchProjectId: string | undefined;
let activeController: AbortController | undefined;

function announce(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RESEARCH_QUEUE_CHANGED));
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel("kuro-research-queue");
      channel.postMessage({ type: "changed" });
      channel.close();
    } catch { /* Custom events still update the current window. */ }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Persistent research requires browser IndexedDB support."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the research queue database."));
    request.onblocked = () => reject(new Error("Close other Kuro Canvas tabs to finish the research database upgrade."));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, transaction: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let result: T;
      let hasResult = false;
      try {
        const request = operation(transaction.objectStore(STORE), transaction);
        request.onsuccess = () => { result = request.result; hasResult = true; };
        request.onerror = () => reject(request.error ?? new Error("Research queue request failed."));
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => hasResult
        ? resolve(result)
        : reject(new Error("Research queue transaction completed without a result."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Research queue transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Research queue transaction was aborted."));
    });
  } finally {
    db.close();
  }
}

function isDepth(value: unknown): value is ResearchDepth {
  return value === "quick" || value === "balanced" || value === "deep" || value === "exhaustive";
}
function isResearchSourceProvider(value: unknown): value is ResearchSourceProvider {
  return value === "wikipedia" || value === "crossref";
}
function isSupportedResearchSourceUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLocaleLowerCase();
    if (host === "en.wikipedia.org") return url.pathname.startsWith("/wiki/") || (url.pathname === "/" && url.searchParams.has("curid"));
    if (host === "doi.org" && !url.search && !url.hash) {
      let path: string;
      try { path = decodeURIComponent(url.pathname); } catch { return false; }
      return /^\/10\.\d{4,9}\/\S+$/i.test(path);
    }
    return false;
  } catch { return false; }
}
function isStatus(value: unknown): value is ResearchTaskStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}
export function validateResearchTask(value: unknown, expectedProjectId?: string): string[] {
  if (!value || typeof value !== "object") return ["Research task must be a record."];
  const task = value as Partial<ResearchTaskRecord>;
  const errors: string[] = [];
  if (typeof task.id !== "string" || !task.id.trim()) errors.push("Research task needs an ID.");
  if (typeof task.projectId !== "string" || !task.projectId.trim()) errors.push("Research task needs a project ID.");
  if (expectedProjectId !== undefined && task.projectId !== expectedProjectId) errors.push("Research task belongs to another project.");
  if (typeof task.query !== "string" || task.query.trim().length < 2 || task.query.length > 1800) errors.push("Research query must contain 2–1800 characters.");
  if (!isDepth(task.depth)) errors.push("Research depth is invalid.");
  if (task.sourceProvider !== undefined && !isResearchSourceProvider(task.sourceProvider)) errors.push("Research source provider is invalid.");
  if (!isStatus(task.status)) errors.push("Research task status is invalid.");
  if (!Number.isFinite(task.progress) || Number(task.progress) < 0 || Number(task.progress) > 100) errors.push("Research progress must be between 0 and 100.");
  if (typeof task.stage !== "string" || typeof task.createdAt !== "string" || typeof task.updatedAt !== "string") errors.push("Research task stage and timestamps are required.");
  if (!Array.isArray(task.sources) || task.sources.length > 12 || task.sources.some(source => {
    if (!source || typeof source.title !== "string" || !source.title.trim() || source.title.length > 400
      || typeof source.extract !== "string" || source.extract.length > 3200
      || typeof source.url !== "string" || source.url.length > 2000) return true;
    return !isSupportedResearchSourceUrl(source.url);
  })) errors.push("Research sources must be bounded HTTPS records from en.wikipedia.org or canonical doi.org DOI links.");
  if (task.leaseUntil !== undefined && !Number.isFinite(task.leaseUntil)) errors.push("Research lease must be a finite timestamp.");
  if (task.error !== undefined && typeof task.error !== "string") errors.push("Research error must be text.");
  return [...new Set(errors)];
}

export function createResearchTask(
  input: { projectId: string; query: string; depth: ResearchDepth; sourceProvider?: ResearchSourceProvider },
  idFactory: () => string = () => crypto.randomUUID(),
  now = new Date().toISOString(),
): ResearchTaskRecord {
  const task: ResearchTaskRecord = {
    id: idFactory(),
    projectId: input.projectId.trim(),
    query: input.query.trim().slice(0, 1800),
    depth: input.depth,
    sourceProvider: input.sourceProvider ?? "wikipedia",
    status: "queued",
    progress: 0,
    stage: "Queued",
    sources: [],
    createdAt: now,
    updatedAt: now,
  };
  const errors = validateResearchTask(task);
  if (errors.length) throw new Error(errors.join(" "));
  return task;
}

/**
 * Prepare research records for a package import without reusing local task IDs
 * or triggering unrequested network activity on first open.
 */
export function normalizeImportedResearchTasks(
  value: unknown,
  sourceProjectId: string,
  destinationProjectId: string,
  idFactory: () => string = () => crypto.randomUUID(),
  now = new Date().toISOString(),
): ResearchTaskRecord[] {
  if (!Array.isArray(value)) throw new Error("Bundled research task history must be a list.");
  if (!sourceProjectId.trim() || !destinationProjectId.trim()) throw new Error("Research import needs source and destination project IDs.");
  const seen = new Set<string>();
  const tasks = value as unknown[];
  for (const candidate of tasks) {
    if (!candidate || typeof candidate !== "object") throw new Error("Bundled research task history contains an invalid record.");
    const task = candidate as Partial<ResearchTaskRecord>;
    if (typeof task.id !== "string" || !task.id.trim()) throw new Error("Every bundled research task needs a stable ID.");
    if (seen.has(task.id)) throw new Error("Bundled research task history contains duplicate IDs.");
    seen.add(task.id);
    if (task.projectId !== sourceProjectId) throw new Error("A bundled research task belongs to a different project.");
    const errors = validateResearchTask(task, sourceProjectId);
    if (errors.length) throw new Error("Bundled research task failed validation: " + errors.join(" "));
  }
  return (tasks as ResearchTaskRecord[]).map(task => {
    const isCompleted = task.status === "completed";
    return {
      ...task,
      id: idFactory(),
      projectId: destinationProjectId,
      sourceProvider: task.sourceProvider ?? "wikipedia",
      status: isCompleted ? "completed" : "cancelled",
      progress: isCompleted ? 100 : Math.min(task.progress, 99),
      stage: isCompleted ? task.stage : "Imported unfinished research — retry to run on this device",
      leaseUntil: undefined,
      updatedAt: now,
    };
  });
}

const SETTINGS_ID = "__queue-settings__";
async function persistQueuePausedState(value: boolean): Promise<void> {
  await transact<IDBValidKey>("readwrite", store => store.put({ id: SETTINGS_ID, queuePaused: value, updatedAt: new Date().toISOString() }));
}
export async function isResearchQueuePaused(): Promise<boolean> {
  const settings = await transact<{ queuePaused?: boolean } | undefined>("readonly", store => store.get(SETTINGS_ID));
  return settings?.queuePaused === true;
}

export const researchTaskStorage = {
  async save(task: ResearchTaskRecord): Promise<void> {
    const errors = validateResearchTask(task);
    if (errors.length) throw new Error("Refusing to save invalid research task: " + errors.join(" "));
    await transact<IDBValidKey>("readwrite", store => store.put(structuredClone(task)));
    announce();
  },
  async get(id: string): Promise<ResearchTaskRecord | undefined> {
    const task = await transact<ResearchTaskRecord | undefined>("readonly", store => store.get(id));
    if (!task) return undefined;
    if (validateResearchTask(task).length) throw new Error("Stored research task failed validation.");
    return task;
  },
  /** Write a validated group of project tasks in one IndexedDB transaction. */
  async saveMany(tasks: readonly ResearchTaskRecord[], expectedProjectId: string): Promise<void> {
    if (!expectedProjectId.trim()) throw new Error("Choose a project before importing research tasks.");
    const seen = new Set<string>();
    for (const task of tasks) {
      const errors = validateResearchTask(task, expectedProjectId);
      if (errors.length) throw new Error("Refusing invalid imported research task: " + errors.join(" "));
      if (seen.has(task.id)) throw new Error("Imported research tasks contain duplicate IDs.");
      seen.add(task.id);
    }
    if (!tasks.length) return;
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const task of tasks) store.put(structuredClone(task));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not import research tasks."));
        tx.onabort = () => reject(tx.error ?? new Error("Research-task import was aborted."));
      });
    } finally { db.close(); }
    announce();
  },
  /** Remove every task owned by one project, including active work and completed source excerpts. */
  async removeProject(projectId: string): Promise<void> {
    if (!projectId.trim()) throw new Error("Choose a project before removing research tasks.");
    // Abort an in-flight fetch before deleting its record. The runner also checks for
    // a missing record after awaits, so it cannot recreate a task after this transaction.
    if (activeResearchProjectId === projectId) activeController?.abort();
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const index = tx.objectStore(STORE).index("projectId");
        const request = index.openCursor(IDBKeyRange.only(projectId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        request.onerror = () => reject(request.error ?? new Error("Could not find project research tasks to remove."));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not remove project research tasks."));
        tx.onabort = () => reject(tx.error ?? new Error("Research-task removal was aborted."));
      });
    } finally { db.close(); }
    announce();
  },
  async list(projectId: string): Promise<ResearchTaskRecord[]> {
    if (!projectId.trim()) return [];
    const all = await transact<ResearchTaskRecord[]>("readonly", store => store.getAll());
    return all.filter(task => validateResearchTask(task, projectId).length === 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async remove(id: string, projectId: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing || existing.projectId !== projectId) return;
    await transact<undefined>("readwrite", store => store.delete(id));
    announce();
  },
  async update(id: string, projectId: string, patch: Partial<ResearchTaskRecord>): Promise<ResearchTaskRecord | undefined> {
    const db = await openDatabase();
    try {
      let updated: ResearchTaskRecord | undefined;
      const result = await new Promise<ResearchTaskRecord | undefined>((resolve, reject) => {
        const transaction = db.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        const request = store.get(id);
        request.onsuccess = () => {
          const current = request.result as ResearchTaskRecord | undefined;
          if (!current || current.projectId !== projectId) return;
          updated = { ...current, ...patch, id: current.id, projectId: current.projectId, updatedAt: new Date().toISOString() };
          const errors = validateResearchTask(updated, projectId);
          if (errors.length) {
            reject(new Error("Refusing invalid task update: " + errors.join(" ")));
            transaction.abort();
            return;
          }
          store.put(updated);
        };
        request.onerror = () => reject(request.error ?? new Error("Could not read research task for update."));
        transaction.oncomplete = () => resolve(updated);
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not update research task."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Research task update was aborted."));
      });
      if (result) announce();
      return result;
    } finally { db.close(); }
  },
  async claimNext(): Promise<ResearchTaskRecord | undefined> {
    const now = Date.now();
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        let claimed: ResearchTaskRecord | undefined;
        const request = store.getAll();
        request.onsuccess = () => {
          const all = request.result as Array<ResearchTaskRecord & { queuePaused?: boolean }>;
          const settings = all.find(item => item.id === SETTINGS_ID);
          if (settings?.queuePaused) return;
          // Coordinate across tabs with persisted leases; a page-local pumping flag
          // alone cannot stop multiple tabs querying the same API concurrently.
          if (all.some(task => task.id !== SETTINGS_ID && task.status === "running" && (task.leaseUntil ?? 0) > now)) return;
          const queue = all.filter(task => task.id !== SETTINGS_ID && (task.status === "queued" || task.status === "running" && (task.leaseUntil ?? 0) <= now))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const next = queue[0];
          if (!next) return;
          claimed = {
            ...next, status: "running", stage: "Starting research", progress: Math.max(next.progress, 1),
            startedAt: next.startedAt ?? new Date(now).toISOString(), leaseUntil: now + 120_000,
            error: undefined, updatedAt: new Date(now).toISOString(),
          };
          store.put(claimed);
        };
        request.onerror = () => reject(request.error ?? new Error("Could not read research jobs."));
        transaction.oncomplete = () => { if (claimed) announce(); resolve(claimed); };
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not claim research task."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Research claim was cancelled."));
      });
    } finally { db.close(); }
  },
};

export async function requestResearchNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

function notifyResearchCompletion(task: ResearchTaskRecord): void {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    new Notification("Kuro's research is ready", {
      body: task.sources.length
        ? task.query + " · collected " + task.sources.length + " source summaries."
        : "Research finished, but no matching Wikipedia pages were found.",
      tag: task.id,
      icon: "./kuro-icon.webp",
    });
  } catch { /* Notification permission or platform policy may still reject delivery. */ }
}

function cleanExtract(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    }).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseWikipediaResearchPayload(payload: unknown, maxSources = 8): ResearchSource[] {
  if (!payload || typeof payload !== "object") return [];
  const pages = (payload as { query?: { pages?: Record<string, unknown> } }).query?.pages;
  if (!pages || typeof pages !== "object") return [];
  return Object.values(pages).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const page = raw as { title?: unknown; extract?: unknown; fullurl?: unknown; pageid?: unknown };
    const title = typeof page.title === "string" ? page.title.trim() : "";
    const extract = cleanExtract(page.extract);
    const suppliedUrl = typeof page.fullurl === "string" ? page.fullurl : "";
    const url = suppliedUrl
      ? (/^https:\/\/en\.wikipedia\.org\//i.test(suppliedUrl) ? suppliedUrl : "")
      : Number.isInteger(page.pageid) ? "https://en.wikipedia.org/?curid=" + Number(page.pageid) : "";
    if (!title || !extract || !url) return [];
    return [{ title, extract: extract.slice(0, 3200), url }];
  }).slice(0, Math.max(1, Math.min(20, Math.floor(maxSources))));
}

export async function searchWikipediaResearch(
  query: string,
  depth: ResearchDepth,
  signal?: AbortSignal,
): Promise<ResearchSource[]> {
  const normalized = query.trim().slice(0, 1800);
  if (normalized.length < 2) throw new Error("Enter at least two characters for research.");
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: normalized, gsrnamespace: "0",
    gsrlimit: String(SEARCH_LIMIT[depth]), prop: "extracts|info", exchars: String(EXTRACT_CHARS[depth]),
    explaintext: "1", inprop: "url", format: "json", origin: "*",
  });
  const response = await fetch("https://en.wikipedia.org/w/api.php?" + params.toString(), {
    method: "GET", headers: { Accept: "application/json" }, signal,
  });
  if (!response.ok) throw new Error("Wikipedia research search failed (HTTP " + response.status + ").");
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error("Wikipedia returned an unreadable research response."); }
  return parseWikipediaResearchPayload(payload, SEARCH_LIMIT[depth]);
}

type CrossrefWork = Record<string, unknown>;
function crossrefYear(work: CrossrefWork): string {
  for (const key of ["published-print", "published-online", "published", "created"]) {
    const value = work[key];
    if (!value || typeof value !== "object") continue;
    const parts = (value as { "date-parts"?: unknown })["date-parts"];
    if (!Array.isArray(parts) || !Array.isArray(parts[0])) continue;
    const year = Number(parts[0][0]);
    if (Number.isInteger(year) && year >= 1000 && year <= 9999) return String(year);
  }
  return "";
}

/** Parse deposited scholarly metadata without inventing abstracts or conclusions. */
export function parseCrossrefWorksPayload(payload: unknown, maxSources = 8): ResearchSource[] {
  if (!payload || typeof payload !== "object") return [];
  const message = (payload as { message?: { items?: unknown } }).message;
  if (!message || !Array.isArray(message.items)) return [];
  return message.items.flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const work = raw as CrossrefWork;
    const doi = typeof work.DOI === "string" ? work.DOI.trim().replace(/^https?:\/\/doi\.org\//i, "") : "";
    if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) return [];
    const titles = Array.isArray(work.title) ? work.title : [];
    const title = typeof titles[0] === "string" ? cleanExtract(titles[0]) : "";
    if (!title) return [];
    const rawAuthors = Array.isArray(work.author) ? work.author : [];
    const authors = rawAuthors.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const author = entry as { given?: unknown; family?: unknown; name?: unknown };
      const name = [author.given, author.family].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ").trim()
        || (typeof author.name === "string" ? author.name.trim() : "");
      return name ? [name] : [];
    }).slice(0, 5);
    const year = crossrefYear(work);
    const publisher = typeof work.publisher === "string" ? cleanExtract(work.publisher) : "";
    const containers = Array.isArray(work["container-title"]) ? work["container-title"] : [];
    const venue = typeof containers[0] === "string" ? cleanExtract(containers[0]) : "";
    const rawAbstract = cleanExtract(work.abstract);
    // Keep a modest excerpt rather than copying long abstracts into a local research vault.
    const abstract = rawAbstract.slice(0, 800);
    const abstractTruncated = rawAbstract.length > abstract.length;
    const details = [
      authors.length ? "Authors: " + authors.join(", ") + (rawAuthors.length > authors.length ? ", et al." : "") : "",
      year ? "Published: " + year : "",
      venue ? "Journal or venue: " + venue : "",
      publisher ? "Publisher: " + publisher : "",
      "DOI: " + doi,
    ].filter(Boolean).join(". ");
    const extract = details + ". " + (abstract
      ? "Abstract excerpt (deposited with Crossref; source may be copyright-protected): " + abstract
      : "Crossref metadata has no abstract for this record. Consult the linked publication record before relying on details not present here.");
    const encodedDoi = doi.split("/").map(part => encodeURIComponent(part)).join("/");
    return [{ title: title.slice(0, 400), url: "https://doi.org/" + encodedDoi, extract: extract.slice(0, 3200) }];
  }).slice(0, Math.max(1, Math.min(20, Math.floor(maxSources))));
}

/** Retrieve scholarly work metadata from Crossref's public REST API. */
export async function searchCrossrefResearch(query: string, depth: ResearchDepth, signal?: AbortSignal): Promise<ResearchSource[]> {
  const normalized = query.trim().slice(0, 1800);
  if (normalized.length < 2) throw new Error("Enter at least two characters for scholarly research.");
  const params = new URLSearchParams({
    "query.bibliographic": normalized,
    rows: String(SEARCH_LIMIT[depth]),
    select: "DOI,title,author,publisher,published-print,published-online,published,abstract,container-title",
  });
  const requestStartedAt = Date.now();
  try {
    const response = await fetch("https://api.crossref.org/v1/works?" + params.toString(), {
      method: "GET", headers: { Accept: "application/json" }, signal,
    });
    if (response.status === 429) throw new Error("Crossref is rate-limiting scholarly searches. Wait briefly, then retry the task.");
    if (response.status === 403) throw new Error("Crossref declined this request. Try again later or use Wikipedia research while this source is unavailable.");
    if (!response.ok) throw new Error("Crossref scholarly metadata search failed (HTTP " + response.status + ").");
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error("Crossref returned an unreadable scholarly metadata response."); }
    return parseCrossrefWorksPayload(payload, SEARCH_LIMIT[depth]);
  } finally {
    // Crossref's current public list-query pool is deliberately rate-limited. Keep
    // the shared queue lease until one second has elapsed so another tab cannot burst.
    const remaining = 1100 - (Date.now() - requestStartedAt);
    if (remaining > 0 && !signal?.aborted) {
      await new Promise<void>(resolve => setTimeout(resolve, remaining));
    }
  }
}

export async function searchResearchSources(query: string, depth: ResearchDepth, sourceProvider: ResearchSourceProvider = "wikipedia", signal?: AbortSignal): Promise<ResearchSource[]> {
  return sourceProvider === "crossref"
    ? searchCrossrefResearch(query, depth, signal)
    : searchWikipediaResearch(query, depth, signal);
}

export async function buildResearchContext(
  tasks: readonly ResearchTaskRecord[],
  projectId: string,
  userMessage: string,
  maxCharacters = 7000,
): Promise<string> {
  if (!projectId.trim()) return "";
  const completed = tasks.filter(task => task.projectId === projectId && task.status === "completed" && task.sources.length > 0);
  if (!completed.length) return "";
  const tokens = [...new Set(userMessage.normalize("NFKC").toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(token => token.length >= 3 && !["the","and","for","with","that","this","about","using","research","source","sources","please","from","into","what","when","where","would","could","should","kuro","help"].includes(token)))];
  const ranked = completed.map(task => {
    const haystack = (task.query + " " + task.sources.map(source => source.title + " " + source.extract).join(" "))
      .normalize("NFKC").toLocaleLowerCase();
    const hits = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
    return { task, hits };
  }).filter(item => !tokens.length || item.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.task.updatedAt.localeCompare(a.task.updatedAt))
    .slice(0, 3);
  if (!ranked.length) return "";
  const lines = [
    "SAVED RESEARCH NOTES — SOURCED REFERENCE MATERIAL, NOT AUTOMATIC CANON",
    "Use the supplied source URLs when making factual claims. Wikipedia extracts are secondary starting points; Crossref records are deposited bibliographic metadata with abstracts only when available. Neither a search result nor an abstract proves that every claim is complete, current, uncontested, or applicable. Distinguish evidence, interpretation, uncertainty and fiction. These notes are not automatic canon; the author decides what becomes story canon.",
  ];
  for (const { task } of ranked) {
    const provider = task.sourceProvider ?? "wikipedia";
    lines.push("\nResearch task: " + task.query + " (source: " + (provider === "crossref" ? "Crossref scholarly metadata" : "English Wikipedia") + "; depth: " + task.depth + "; collected: " + task.sources.length + " sources)");
    for (const source of task.sources.slice(0, 8)) {
      lines.push("- " + source.title + " — " + source.url);
      lines.push("  Extract: " + source.extract.slice(0, 2200));
    }
  }
  const limit = Math.max(1000, Math.min(16000, Math.floor(maxCharacters)));
  let context = lines.join("\n");
  if (context.length > limit) context = context.slice(0, limit - 28).trimEnd() + "\n[Research context truncated.]";
  return context;
}

/** Start once at app root. Queue state is durable; execution resumes when the page is reopened. */
export function startResearchQueueRunner(): () => void {
  if (runnerStarted || typeof window === "undefined") return () => undefined;
  runnerStarted = true;
  const wake = () => { void pumpQueue(); };
  let queueChannel: BroadcastChannel | undefined;
  window.addEventListener(RESEARCH_QUEUE_CHANGED, wake);
  window.addEventListener("online", wake);
  window.addEventListener("pageshow", wake);
  if (typeof BroadcastChannel !== "undefined") {
    try {
      queueChannel = new BroadcastChannel("kuro-research-queue");
      queueChannel.addEventListener("message", wake);
    } catch { queueChannel = undefined; }
  }
  if ("serviceWorker" in navigator && window.isSecureContext) {
    void navigator.serviceWorker.register("./service-worker.js").then(async registration => {
      try {
        const syncRegistration = registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
        if (syncRegistration.sync) await syncRegistration.sync.register("kuro-research-queue");
      } catch { /* Background Sync is optional; the visible page runner remains available. */ }
      wake();
    }).catch(() => { /* Static preview or offline mode may not allow service workers. */ });
  }
  wake();
  return () => {
    window.removeEventListener(RESEARCH_QUEUE_CHANGED, wake);
    window.removeEventListener("online", wake);
    window.removeEventListener("pageshow", wake);
    queueChannel?.removeEventListener("message", wake);
    queueChannel?.close();
    runnerStarted = false;
    activeController?.abort();
  };
}

export function pauseResearchQueue(): void {
  paused = true;
  void persistQueuePausedState(true).then(announce).catch(() => announce());
  activeController?.abort();
  try { if (typeof navigator !== "undefined") navigator.serviceWorker?.controller?.postMessage({ type: "KURO_RESEARCH_PAUSED" }); } catch { /* Optional worker control. */ }
}

export function resumeResearchQueue(): void {
  paused = false;
  void persistQueuePausedState(false).then(() => {
    announce();
    try { if (typeof navigator !== "undefined") navigator.serviceWorker?.controller?.postMessage({ type: "KURO_RESEARCH_RESUMED" }); } catch { /* Optional worker control. */ }
    void pumpQueue();
  }).catch(() => { announce(); void pumpQueue(); });
}

export async function enqueueResearchTask(input: { projectId: string; query: string; depth: ResearchDepth; sourceProvider?: ResearchSourceProvider }): Promise<ResearchTaskRecord> {
  const task = createResearchTask(input);
  await researchTaskStorage.save(task);
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator && window.isSecureContext) {
      const registration = await navigator.serviceWorker.getRegistration();
      const syncRegistration = registration as (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }) | undefined;
      if (syncRegistration?.sync) await syncRegistration.sync.register("kuro-research-queue");
      syncRegistration?.active?.postMessage({ type: "KURO_RESEARCH_QUEUED", taskId: task.id });
    }
  } catch { /* Queue still runs in the current page and resumes on next app launch. */ }
  void pumpQueue();
  return task;
}

export async function cancelResearchTask(id: string, projectId: string): Promise<void> {
  const task = await researchTaskStorage.get(id);
  if (!task || task.projectId !== projectId || task.status === "completed" || task.status === "failed") return;
  await researchTaskStorage.update(id, projectId, { status: "cancelled", stage: "Cancelled", leaseUntil: undefined, error: undefined });
  if (activeTaskId === id) activeController?.abort();
  announce();
}

export async function retryResearchTask(task: ResearchTaskRecord): Promise<void> {
  await researchTaskStorage.update(task.id, task.projectId, {
    status: "queued", progress: 0, stage: "Queued for retry", sources: [], error: undefined,
    startedAt: undefined, completedAt: undefined, leaseUntil: undefined,
  });
  void pumpQueue();
}

async function pumpQueue(): Promise<void> {
  if (pumping || paused || typeof window === "undefined") return;
  pumping = true;
  try {
    while (!paused) {
      const task = await researchTaskStorage.claimNext();
      if (!task || paused) break;
      const controller = new AbortController();
      activeController = controller;
      activeTaskId = task.id;
      activeResearchProjectId = task.projectId;
      try {
        await researchTaskStorage.update(task.id, task.projectId, {
          stage: task.sourceProvider === "crossref" ? "Searching Crossref scholarly metadata" : "Searching Wikipedia", progress: 8, leaseUntil: Date.now() + 120_000,
        });
        const sources = await searchResearchSources(task.query, task.depth, task.sourceProvider ?? "wikipedia", controller.signal);
        const current = await researchTaskStorage.get(task.id);
        if (!current || current.status === "cancelled") continue;
        if (paused || controller.signal.aborted) {
          await researchTaskStorage.update(task.id, task.projectId, { status: "queued", stage: "Paused — waiting to resume", leaseUntil: undefined });
          continue;
        }
        // Complete with a conditional, project-scoped update instead of put/save:
        // a deletion can occur between the read above and this write, and must never
        // be undone by a late network response recreating the task.
        const completed = await researchTaskStorage.update(task.id, task.projectId, {
          status: "completed",
          progress: 100,
          stage: sources.length ? "Research sources collected" : "Research completed — no matching entries from " + ((task.sourceProvider ?? "wikipedia") === "crossref" ? "Crossref" : "Wikipedia"),
          sources,
          completedAt: new Date().toISOString(),
          leaseUntil: undefined,
          error: undefined,
        });
        if (!completed) continue;
        notifyResearchCompletion(completed);
      } catch (error) {
        const current = await researchTaskStorage.get(task.id).catch(() => undefined);
        if (!current || current.status === "cancelled") continue;
        if (paused || controller.signal.aborted) {
          await researchTaskStorage.update(task.id, task.projectId, { status: "queued", stage: "Paused — waiting to resume", leaseUntil: undefined });
          continue;
        }
        const message = error instanceof Error ? error.message : "Unexpected research task error.";
        await researchTaskStorage.update(task.id, task.projectId, {
          status: "failed", stage: "Research failed", error: message, leaseUntil: undefined, completedAt: new Date().toISOString(),
        });
      } finally {
        activeController = undefined;
        activeTaskId = undefined;
        activeResearchProjectId = undefined;
      }
    }
  } catch (error) {
    // Persisted tasks remain queued if IndexedDB or the browser fails temporarily.
    if (typeof console !== "undefined") console.error("Kuro research queue runner stopped:", error);
  } finally {
    pumping = false;
    if (!paused) {
      // Catch a task enqueued in the small window between the final claim and pump shutdown.
      void transact<ResearchTaskRecord[]>("readonly", store => store.getAll()).then(all => {
        const now = Date.now();
        const settings = all.find(task => task.id === SETTINGS_ID) as (ResearchTaskRecord & { queuePaused?: boolean }) | undefined;
        const activeLeaseExists = all.some(task => task.id !== SETTINGS_ID && task.status === "running" && (task.leaseUntil ?? 0) > now);
        const queuedWorkExists = all.some(task => task.id !== SETTINGS_ID && (task.status === "queued" || task.status === "running" && (task.leaseUntil ?? 0) <= now));
        // Do not spin while another tab owns the live lease. Its completion is
        // broadcast through queueChannel and will wake this runner exactly when useful.
        if (!settings?.queuePaused && !activeLeaseExists && queuedWorkExists) void pumpQueue();
      }).catch(() => undefined);
    }
  }
}

export async function listenForResearchQueueChanges(listener: TaskEventListener): Promise<() => void> {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(RESEARCH_QUEUE_CHANGED, listener);
  let channel: BroadcastChannel | undefined;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel("kuro-research-queue");
      channel.addEventListener("message", listener);
    } catch { channel = undefined; }
  }
  return () => {
    window.removeEventListener(RESEARCH_QUEUE_CHANGED, listener);
    channel?.removeEventListener("message", listener);
    channel?.close();
  };
}
