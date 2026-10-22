import { describe, expect, it } from "vitest";
import {
  canPersistMemory,
  canShareMemory,
  DEFAULT_EVOLUTION_POLICY,
  validateMemory,
  type KuroMemory,
} from "./evolution";

const now = "2026-10-22T00:00:00.000Z";
const provenance = [{ sourceType: "user-confirmation" as const, sourceId: "turn-1", observedAt: now }];
const base: KuroMemory = {
  id: "memory-1",
  scope: "project",
  projectId: "project-1",
  kind: "canon-fact",
  title: "The lantern rule",
  content: "The blue lantern means the captain has returned.",
  status: "proposed",
  confidence: 0.9,
  provenance,
  createdAt: now,
  updatedAt: now,
  privacyReviewed: false,
};

describe("Kuro memory record validation", () => {
  it("accepts a complete project-scoped record", () => {
    expect(validateMemory(base)).toBe(true);
  });

  it.each([
    ["unknown status", { status: "maybe" }],
    ["missing privacy flag", { privacyReviewed: undefined }],
    ["invalid confidence", { confidence: Number.NaN }],
    ["missing project key", { projectId: "   " }],
    ["invalid creation time", { createdAt: "yesterdayish" }],
    ["malformed provenance source", { provenance: [{ sourceType: "invented", observedAt: now }] }],
    ["invalid provenance timestamp", { provenance: [{ sourceType: "tool-result", observedAt: "not-a-date" }] }],
    ["non-object root", null],
  ])("rejects %s", (_label, patch) => {
    const candidate = patch === null ? patch : { ...base, ...patch };
    expect(validateMemory(candidate)).toBe(false);
  });

  it("does not accept a project-linked record as globally shared memory", () => {
    expect(validateMemory({
      ...base,
      scope: "shared",
      projectId: "private-project",
      privacyReviewed: true,
      status: "approved",
    })).toBe(false);
  });
});

describe("Kuro memory persistence and sharing policy", () => {
  const sharingEnabled = { ...DEFAULT_EVOLUTION_POLICY, sharedLearningEnabled: true };
  const pendingShared: KuroMemory = {
    ...base,
    id: "shared-candidate",
    scope: "shared",
    projectId: undefined,
    status: "proposed",
    privacyReviewed: true,
  };

  it("allows policy-authorized reviewed shared candidates to be persisted locally before approval", () => {
    expect(canPersistMemory(pendingShared, sharingEnabled)).toBe(true);
    expect(canPersistMemory(pendingShared, DEFAULT_EVOLUTION_POLICY)).toBe(false);
  });

  it("does not make a proposed memory eligible for sharing", () => {
    expect(canShareMemory(pendingShared, sharingEnabled)).toBe(false);
  });

  it("shares only validated, approved, reviewed and evidence-backed global memory", () => {
    const approved = { ...pendingShared, status: "approved" as const };
    expect(canShareMemory(approved, sharingEnabled)).toBe(true);
    expect(canShareMemory({ ...approved, provenance: [] }, sharingEnabled)).toBe(false);
    expect(canShareMemory({ ...approved, privacyReviewed: false }, sharingEnabled)).toBe(false);
    expect(canShareMemory({ ...approved, status: "superseded" }, sharingEnabled)).toBe(false);
  });
});
