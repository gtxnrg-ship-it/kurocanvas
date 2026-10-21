/* Kuro Canvas background research helper. Long-running execution is browser-controlled and best-effort. */
const DB_NAME = "kurocanvas-background-research";
const DB_VERSION = 1;
const STORE = "tasks";
const SYNC_TAG = "kuro-research-queue";
const MAX_SOURCES = { quick: 3, balanced: 5, deep: 8, exhaustive: 12 };
const EXTRACT_CHARS = { quick: 1000, balanced: 1700, deep: 2300, exhaustive: 3000 };

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", event => {
  if (event.data && event.data.type === "KURO_RESEARCH_QUEUED") {
    event.waitUntil?.(Promise.resolve());
    registerResearchSync();
  }
});
self.addEventListener("sync", event => {
  if (event.tag === SYNC_TAG) event.waitUntil(processQueue());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const destination = new URL("./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const client = clients.find(item => "focus" in item);
    return client ? client.focus() : self.clients.openWindow(destination);
  }));
});

async function registerResearchSync() {
  try {
    if (self.registration.sync) await self.registration.sync.register(SYNC_TAG);
  } catch (_) { /* Background Sync is optional. */ }
}
function openDatabase() {
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
    request.onerror = () => reject(request.error || new Error("Could not open research task storage."));
  });
}
async function claimNextTask() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let claimed;
      const request = store.getAll();
      request.onsuccess = () => {
        const now = Date.now();
        const next = request.result.filter(task =>
          task.status === "queued" || task.status === "running" && (task.leaseUntil || 0) <= now
        ).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!next) return;
        claimed = {
          ...next, status: "running", stage: "Researching while Kuro is in the background",
          progress: Math.max(next.progress || 0, 1), startedAt: next.startedAt || new Date(now).toISOString(),
          leaseUntil: now + 120000, updatedAt: new Date(now).toISOString(),
        };
        store.put(claimed);
      };
      request.onerror = () => reject(request.error || new Error("Could not find queued research tasks."));
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(tx.error || new Error("Could not claim research task."));
      tx.onabort = () => reject(tx.error || new Error("Research claim was aborted."));
    });
  } finally { db.close(); }
}
async function updateTask(id, patch) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let saved;
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.status === "cancelled") return;
        saved = { ...current, ...patch, id: current.id, projectId: current.projectId, updatedAt: new Date().toISOString() };
        store.put(saved);
      };
      request.onerror = () => reject(request.error || new Error("Could not read research task."));
      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(tx.error || new Error("Could not update research task."));
      tx.onabort = () => reject(tx.error || new Error("Research task update was aborted."));
    });
  } finally { db.close(); }
}
function plain(value) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim()
    : "";
}
async function collectSources(task) {
  const depth = task.depth in MAX_SOURCES ? task.depth : "balanced";
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: String(task.query).slice(0, 1800), gsrnamespace: "0",
    gsrlimit: String(MAX_SOURCES[depth]), prop: "extracts|info", exchars: String(EXTRACT_CHARS[depth]),
    explaintext: "1", inprop: "url", format: "json", origin: "*",
  });
  const response = await fetch("https://en.wikipedia.org/w/api.php?" + params.toString(), {
    method: "GET", headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Wikipedia research search failed (HTTP " + response.status + ").");
  const payload = await response.json();
  const pages = payload && payload.query && payload.query.pages;
  if (!pages || typeof pages !== "object") return [];
  return Object.values(pages).flatMap(page => {
    if (!page || typeof page !== "object") return [];
    const title = typeof page.title === "string" ? page.title.trim() : "";
    const extract = plain(page.extract).slice(0, 3200);
    const url = typeof page.fullurl === "string" && /^https:\/\/en\.wikipedia\.org\//i.test(page.fullurl)
      ? page.fullurl
      : Number.isInteger(page.pageid) ? "https://en.wikipedia.org/?curid=" + Number(page.pageid) : "";
    if (!title || !extract || !url) return [];
    return [{ title, extract, url }];
  }).slice(0, MAX_SOURCES[depth]);
}
async function processQueue() {
  // Claiming each record in a read/write transaction prevents the app page and
  // service worker from deliberately claiming the same queued item at once.
  let processed = 0;
  while (processed < 3) {
    const task = await claimNextTask();
    if (!task) return;
    processed += 1;
    try {
      const sources = await collectSources(task);
      await updateTask(task.id, {
        status: "completed", progress: 100,
        stage: sources.length ? "Research sources collected in background" : "Finished — no matching pages",
        sources, completedAt: new Date().toISOString(), leaseUntil: undefined, error: undefined,
      });
      await self.registration.showNotification("Kuro's research is ready", {
        body: sources.length
          ? task.query + " · collected " + sources.length + " source summaries."
          : "Research finished, but no matching Wikipedia pages were found.",
        tag: task.id,
        icon: "./kuro-icon.webp",
        data: { url: new URL("./", self.registration.scope).href, taskId: task.id },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background research failed.";
      await updateTask(task.id, {
        status: "failed", stage: "Background research failed", error: message,
        leaseUntil: undefined, completedAt: new Date().toISOString(),
      });
      await self.registration.showNotification("Kuro's research needs attention", {
        body: task.query + " · " + message.slice(0, 160),
        tag: task.id,
        icon: "./kuro-icon.webp",
        data: { url: new URL("./", self.registration.scope).href, taskId: task.id },
      });
    }
  }
}
