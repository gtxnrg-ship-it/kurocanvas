import { describe, expect, it } from "vitest";
import {
  liveCreationSessionStorageKey,
  restoreLiveCreationSession,
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
        log: [{ id: "active", kind: "batch", label: "Batch 2", status: "working" }],
      }), "project-1");
      expect(restored?.status).toBe("paused");
      expect(restored?.lastError).toContain("interrupted");
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
});
