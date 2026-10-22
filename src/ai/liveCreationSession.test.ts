import { describe, expect, it } from "vitest";
import {
  liveCreationSessionStorageKey,
  restoreLiveCreationSession,
  DEFAULT_LIVE_CREATION_MAX_BATCHES,
  settleLiveCreationBatch,
  pauseLiveCreationBeforeApply,
  settleLiveCreationPlanning,
  type LiveCreationSession,
} from "./liveCreationSession";

const session: LiveCreationSession = {
  projectId: "project-1",
  id: "session-1",
  originalPrompt: "Create a detailed character turnaround",
  batches: 1,
  maxBatches: 4,
  autoContinue: true,
  status: "complete",
  activeSummary: "COMPLETE: Saved the front view.",
  lastError: "",
  log: [
    { id: "log-1", kind: "batch", label: "Batch 1: Saved the front view.", status: "done" },
  ],
};

describe("live creation session recovery", () => {
  it("scopes persisted sessions to the owning project", () => {
    expect(liveCreationSessionStorageKey("project-1")).not.toBe(liveCreationSessionStorageKey("project-2"));
    expect(restoreLiveCreationSession(JSON.stringify(session), "project-1")).toMatchObject(session);
    expect(restoreLiveCreationSession(JSON.stringify(session), "project-2")).toBeNull();
  });

  it("pauses an interrupted planning or drawing session instead of claiming completion", () => {
    for (const status of ["planning", "drawing"] as const) {
      const restored = restoreLiveCreationSession(JSON.stringify({
        ...session,
        status,
        batches: status === "drawing" ? 2 : 1,
        log: [{ id: "active", kind: "batch", label: "Batch 2", status: "working" }],
      }), "project-1");
      expect(restored?.status).toBe("paused");
      expect(restored?.lastError).toContain("interrupted");
      expect(restored?.batches).toBe(1);
      expect(restored?.log.some(entry => entry.status === "working")).toBe(false);
      expect(restored?.log.some(entry => entry.status === "paused")).toBe(true);
    }
  });

  it("returns null for malformed or structurally invalid storage", () => {
    expect(restoreLiveCreationSession("not json", "project-1")).toBeNull();
    expect(restoreLiveCreationSession(JSON.stringify({ ...session, batches: -1 }), "project-1")).toBeNull();
    expect(restoreLiveCreationSession(JSON.stringify({ ...session, log: [{ ...session.log[0], status: "working; execute arbitrary code" }] }), "project-1")).toBeNull();
  });

  it("keeps completed sessions unchanged", () => {
    expect(restoreLiveCreationSession(JSON.stringify(session), "project-1")).toEqual(session);
  });
  it("supports bounded long-form runs without accepting an unbounded batch budget", () => {
    expect(DEFAULT_LIVE_CREATION_MAX_BATCHES).toBe(12);
    expect(restoreLiveCreationSession(JSON.stringify({ ...session, maxBatches: 20 }), "project-1")?.maxBatches).toBe(20);
    expect(restoreLiveCreationSession(JSON.stringify({ ...session, maxBatches: 21 }), "project-1")).toBeNull();
  });

  it("settles a cancelled batch as paused without counting it as verified", () => {
    const inFlight: LiveCreationSession = {
      ...session,
      batches: 2,
      status: "drawing",
      activeSummary: "CONTINUE: Add the next missing part.",
      log: [
        { id: "batch-2", kind: "batch", label: "Batch 2: Add the next part.", status: "working" },
      ],
    };
    const settled = settleLiveCreationBatch(inFlight, "batch-2", "cancelled", "original canvas restored", false);
    expect(settled?.session.status).toBe("paused");
    expect(settled?.session.batches).toBe(1);
    expect(settled?.canContinue).toBe(false);
    expect(settled?.session.log.some(entry => entry.status === "working")).toBe(false);
    expect(settleLiveCreationBatch(settled!.session, "batch-2", "cancelled", "duplicate callback", false)).toBeNull();
  });

  it("only auto-continues a successful batch while Live Creation remains active", () => {
    const inFlight: LiveCreationSession = {
      ...session,
      batches: 2,
      status: "drawing",
      autoContinue: true,
      maxBatches: 12,
      activeSummary: "CONTINUE: Draw the next missing panel.",
      log: [{ id: "batch-2", kind: "batch", label: "Batch 2", status: "working" }],
    };
    const inLiveMode = settleLiveCreationBatch(inFlight, "batch-2", "success", "read back verified", true);
    expect(inLiveMode?.canContinue).toBe(true);
    expect(inLiveMode?.session.status).toBe("planning");
    const awayFromStudio = settleLiveCreationBatch(inFlight, "batch-2", "success", "read back verified", false);
    expect(awayFromStudio?.canContinue).toBe(false);
    expect(awayFromStudio?.session.status).toBe("paused");
  });

  it("does not settle a drawing result that is not in this session's timeline", () => {
    expect(settleLiveCreationBatch(session, "unrelated-plan", "success", "saved", true)).toBeNull();
  });

  it("pauses a plan when the creator leaves before any native action is applied", () => {
    const planning: LiveCreationSession = {
      ...session,
      batches: 2,
      status: "planning",
      lastError: "",
      log: [{ id: "request-3", kind: "request", label: "Continue creation", status: "working" }],
    };
    const paused = pauseLiveCreationBeforeApply(planning);
    expect(paused.status).toBe("paused");
    expect(paused.batches).toBe(2);
    expect(paused.lastError).toContain("No canvas changes were made");
    expect(paused.log.some(entry => entry.status === "working")).toBe(false);
    expect(paused.log.some(entry => entry.label.includes("canvas unchanged"))).toBe(true);
  });

  it("settles model cancellation and provider failure before a drawing batch starts", () => {
    const planning: LiveCreationSession = {
      ...session,
      batches: 3,
      status: "planning",
      lastError: "",
      log: [{ id: "request-4", kind: "request", label: "Create the next panel", status: "working" }],
    };
    const cancelled = settleLiveCreationPlanning(planning, "cancelled", "Creator stopped inference", true);
    expect(cancelled.status).toBe("paused");
    expect(cancelled.batches).toBe(3);
    expect(cancelled.log.some(entry => entry.status === "working")).toBe(false);

    const failed = settleLiveCreationPlanning(planning, "error", "Model returned invalid output", true);
    expect(failed.status).toBe("error");
    expect(failed.lastError).toContain("invalid output");
    expect(failed.batches).toBe(3);

    const failedAfterLeaving = settleLiveCreationPlanning(planning, "error", "Provider failed", false);
    expect(failedAfterLeaving.status).toBe("paused");
  });

});
