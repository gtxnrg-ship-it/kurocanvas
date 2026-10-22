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

export const DEFAULT_LIVE_CREATION_MAX_BATCHES = 12;
export const MAX_LIVE_CREATION_BATCHES = 20;

const PREFIX = "kuro-live-creation:v1:"
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
      || !Number.isInteger(record.maxBatches) || (record.maxBatches as number) < 1 || (record.maxBatches as number) > MAX_LIVE_CREATION_BATCHES
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
      // The counter is incremented when a plan begins. An interrupted drawing batch
      // was never fully read back, so it must not remain in the verified-batch count.
      if (restored.status === "drawing") restored.batches = Math.max(0, restored.batches - 1);
      restored.status = "paused";
      restored.lastError = "Kuro was interrupted by a reload or app restart. Inspect the saved canvas before continuing; unfinished work was not assumed complete.";
      restored.log = [
        ...restored.log.map((entry): LiveCreationLogEntry => entry.status === "working"
          ? { ...entry, status: "paused", label: entry.label + " · interrupted; inspect before continuing" }
          : entry),
        {
          id: "recovery-" + restored.id,
          kind: "status" as const,
          label: "Previous live creation was interrupted. Review the saved canvas before resuming.",
          status: "paused" as const,
        },
      ].slice(-24);
    }
    return restored;
  } catch {
    return null;
  }
}


export type LiveCreationBatchResult = "success" | "error" | "cancelled";

export interface SettledLiveCreationBatch {
  session: LiveCreationSession;
  canContinue: boolean;
  hitLimit: boolean;
  wantsMore: boolean;
}

/**
 * Settle only a batch owned by this session. A failed/cancelled attempt is not counted
 * as a verified batch, and leaving the live workspace suppresses automatic continuation.
 */
export function settleLiveCreationBatch(
  current: LiveCreationSession,
  batchId: string,
  result: LiveCreationBatchResult,
  message: string,
  allowAutomaticContinuation: boolean,
): SettledLiveCreationBatch | null {
  const matchingBatch = current.log.find(entry => entry.kind === "batch" && entry.id === batchId);
  if (!matchingBatch || matchingBatch.status !== "working") return null;

  const nextLog = current.log.map(entry => entry.kind === "batch" && entry.id === batchId
    ? {
        ...entry,
        status: result === "success" ? "done" as const : result === "cancelled" ? "paused" as const : "error" as const,
        label: entry.label + " · " + (result === "success" ? "saved and verified" : result === "cancelled" ? "cancelled and rolled back" : "failed"),
      }
    : entry);

  const wantsMore = result === "success" && /^CONTINUE:/i.test(current.activeSummary.trim());
  const canContinue = wantsMore && current.autoContinue && allowAutomaticContinuation && current.batches < current.maxBatches;
  const hitLimit = wantsMore && current.autoContinue && current.batches >= current.maxBatches;
  const status: LiveCreationSession["status"] = result === "error"
    ? "error"
    : result === "cancelled"
      ? "paused"
      : canContinue
        ? "planning"
        : hitLimit || wantsMore
          ? "paused"
          : "complete";
  const batchNumber = current.batches;
  const resultLabel = result === "success"
    ? "Batch " + batchNumber + " saved and verified · " + message
    : result === "cancelled"
      ? "Batch " + batchNumber + " cancelled · " + message
      : "Batch " + batchNumber + " failed · " + message;
  const nextSession: LiveCreationSession = {
    ...current,
    batches: result === "success" ? current.batches : Math.max(0, current.batches - 1),
    status,
    lastError: result === "error" ? message : "",
    log: [...nextLog, {
      id: "settled-" + batchId,
      kind: "status" as const,
      label: resultLabel,
      status: (result === "success" ? "done" : result === "cancelled" ? "paused" : "error") as LiveCreationLogEntry["status"],
    }].slice(-24),
  };
  return { session: nextSession, canContinue, hitLimit, wantsMore };
}


/** Keep a validated-but-unapplied plan from appearing active after the creator leaves Live Creation. */
export function pauseLiveCreationBeforeApply(
  current: LiveCreationSession,
  message = "The creator left Live Creation before the proposed drawing batch was applied. No canvas changes were made; review the saved canvas and re-plan before continuing.",
): LiveCreationSession {
  const log = current.log.map(entry => entry.kind === "request" && entry.status === "working"
    ? { ...entry, status: "paused" as const, label: entry.label + " · paused before drawing; canvas unchanged" }
    : entry);
  return {
    ...current,
    status: "paused",
    lastError: message,
    log: [...log, {
      id: "paused-before-drawing-" + current.id + "-" + current.batches,
      kind: "status" as const,
      label: "Live Creation paused before drawing. The proposed plan was not applied.",
      status: "paused" as const,
    }].slice(-24),
  };
}


export type LiveCreationPlanningOutcome = "cancelled" | "error";

/**
 * Settle inference that ended before any native canvas batch began. Never increment
 * the verified batch counter for a plan the executor did not apply and read back.
 */
export function settleLiveCreationPlanning(
  current: LiveCreationSession,
  outcome: LiveCreationPlanningOutcome,
  message: string,
  studioStillActive: boolean,
): LiveCreationSession {
  if (current.status !== "planning") return current;
  const paused = outcome === "cancelled" || !studioStillActive;
  const status: LiveCreationSession["status"] = paused ? "paused" : "error";
  const logStatus: LiveCreationLogEntry["status"] = paused ? "paused" : "error";
  const action = paused ? "paused" : "failed";
  const log = current.log.map(entry => entry.kind === "request" && entry.status === "working"
    ? { ...entry, status: logStatus, label: entry.label + " · planning " + action }
    : entry);
  return {
    ...current,
    status,
    lastError: message,
    log: [...log, {
      id: "planning-settled-" + current.id + "-" + current.batches,
      kind: "status" as const,
      label: "Live Creation " + action + " before drawing. No native actions were applied.",
      status: logStatus,
    }].slice(-24),
  };
}
