export type LiveCreationLogEntry = {
  id: string;
  kind: "request" | "batch" | "status";
  label: string;
  status: "working" | "done" | "paused" | "error";
};

export type LiveCreationSession = {
  projectId: string;
  id: string;
  originalPrompt: string;
  batches: number;
  maxBatches: number;
  autoContinue: boolean;
  status: "ready" | "planning" | "drawing" | "complete" | "paused" | "error";
  activeSummary: string;
  lastError: string;
  log: LiveCreationLogEntry[];
};

const PREFIX = "kuro-live-creation:v1:";
const SESSION_STATUSES = new Set(["ready", "planning", "drawing", "complete", "paused", "error"]);
const LOG_KINDS = new Set(["request", "batch", "status"]);
const LOG_STATUSES = new Set(["working", "done", "paused", "error"]);

export function liveCreationSessionStorageKey(projectId: string): string {
  return PREFIX + encodeURIComponent(projectId.trim());
}

/** Validate saved data before displaying it, and pause interrupted work rather than implying it finished. */
export function restoreLiveCreationSession(raw: string | null, projectId: string): LiveCreationSession | null {
  if (!raw || !projectId.trim()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.projectId !== projectId
      || typeof record.id !== "string" || !record.id || record.id.length > 128
      || typeof record.originalPrompt !== "string" || record.originalPrompt.length > 12000
      || !Number.isInteger(record.batches) || (record.batches as number) < 0 || (record.batches as number) > 1000
      || !Number.isInteger(record.maxBatches) || (record.maxBatches as number) < 1 || (record.maxBatches as number) > 20
      || typeof record.autoContinue !== "boolean"
      || typeof record.status !== "string" || !SESSION_STATUSES.has(record.status)
      || typeof record.activeSummary !== "string" || record.activeSummary.length > 6000
      || typeof record.lastError !== "string" || record.lastError.length > 3000
      || !Array.isArray(record.log) || record.log.length > 24) return null;

    const log: LiveCreationLogEntry[] = [];
    for (const item of record.log) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== "string" || !entry.id || entry.id.length > 128
        || typeof entry.kind !== "string" || !LOG_KINDS.has(entry.kind)
        || typeof entry.label !== "string" || entry.label.length > 1200
        || typeof entry.status !== "string" || !LOG_STATUSES.has(entry.status)) return null;
      log.push({
        id: entry.id,
        kind: entry.kind as LiveCreationLogEntry["kind"],
        label: entry.label,
        status: entry.status as LiveCreationLogEntry["status"],
      });
    }

    const restored: LiveCreationSession = {
      projectId,
      id: record.id,
      originalPrompt: record.originalPrompt,
      batches: record.batches as number,
      maxBatches: record.maxBatches as number,
      autoContinue: record.autoContinue,
      status: record.status as LiveCreationSession["status"],
      activeSummary: record.activeSummary,
      lastError: record.lastError,
      log,
    };

    if (restored.status === "planning" || restored.status === "drawing") {
      restored.status = "paused";
      restored.lastError = "Kuro was interrupted by a reload or app restart. Inspect the saved canvas before continuing; unfinished work was not assumed complete.";
      restored.log = [
        ...restored.log.map(entry => entry.status === "working" ? { ...entry, status: "paused" as const, label: entry.label + " · interrupted; inspect before continuing" } : entry),
        {
          id: "recovery-" + restored.id,
          kind: "status",
          label: "Previous live creation was interrupted. Review the saved canvas before resuming.",
          status: "paused",
        },
      ].slice(-24);
    }
    return restored;
  } catch {
    return null;
  }
}
