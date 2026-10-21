import type { LocalDrawingDocument } from "../core/storage";

export interface DrawingReadbackExpectation {
  id: string;
  projectId?: string;
  version: 1;
  width: number;
  height: number;
  background: string;
  strokes: LocalDrawingDocument["strokes"];
  layers?: LocalDrawingDocument["layers"];
}

export type DrawingReadbackResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Compare the document written by an agent with the document read back from durable
 * storage. Ignore timestamps, but verify ownership, dimensions, background, layers,
 * and every stroke field so callers never report success based only on a resolved write.
 */
export function verifyDrawingReadback(
  expected: DrawingReadbackExpectation,
  actual: LocalDrawingDocument | undefined,
): DrawingReadbackResult {
  if (!expected.projectId?.trim()) return { ok: false, reason: "The expected drawing has no owning project." };
  if (!actual) return { ok: false, reason: "The saved drawing could not be read back." };
  if (actual.id !== expected.id) return { ok: false, reason: "The saved drawing ID does not match the active drawing." };
  if (actual.projectId !== expected.projectId) return { ok: false, reason: "The saved drawing belongs to a different project." };
  if (actual.version !== expected.version) return { ok: false, reason: "The saved drawing version changed unexpectedly." };
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return { ok: false, reason: "The saved canvas dimensions do not match the approved plan result." };
  }
  if (actual.background !== expected.background) return { ok: false, reason: "The saved canvas background does not match the approved plan result." };
  if (stableSerialize(actual.layers ?? []) !== stableSerialize(expected.layers ?? [])) {
    return { ok: false, reason: "Saved layer state does not match the approved plan result." };
  }
  if (stableSerialize(actual.strokes) !== stableSerialize(expected.strokes)) {
    return { ok: false, reason: "Saved editable strokes do not match the approved plan result." };
  }
  return { ok: true };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + stableSerialize(record[key])).join(",") + "}";
}

export interface DrawingReadbackStorage {
  save(document: LocalDrawingDocument): Promise<void>;
  load(id: string, projectId?: string): Promise<LocalDrawingDocument | undefined>;
}

/**
 * Persist then read back a plan result. If either step fails, restore and verify the
 * previous document before surfacing the original failure. A caller must not report
 * success unless the durable state matches the proposed output.
 */
export async function saveDrawingWithReadback(
  storage: DrawingReadbackStorage,
  previous: LocalDrawingDocument,
  intended: LocalDrawingDocument,
): Promise<void> {
  try {
    await storage.save(intended);
    const actual = await storage.load(intended.id, intended.projectId);
    const verification = verifyDrawingReadback(intended, actual);
    if (!verification.ok) throw new Error(verification.reason);
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : "Unknown drawing persistence failure.";
    try {
      await storage.save(previous);
      const restored = await storage.load(previous.id, previous.projectId);
      const restorationCheck = verifyDrawingReadback(previous, restored);
      if (!restorationCheck.ok) {
        throw new Error(restorationCheck.reason);
      }
    } catch (restoreError) {
      const restoreMessage = restoreError instanceof Error ? restoreError.message : "Unknown recovery failure.";
      throw new Error("Canvas save verification failed: " + originalMessage + ". Automatic rollback could not be verified: " + restoreMessage + ". Keep the pre-plan revision as a recovery point.");
    }
    throw new Error("Canvas save verification failed; the previous artwork was restored and read back successfully. " + originalMessage);
  }
}
