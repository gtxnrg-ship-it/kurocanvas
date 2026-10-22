import { describe, expect, it } from "vitest";
import { chooseDrawingTarget } from "./drawingTarget";

const drawings = [
  { id: "recent", name: "Most recently saved sketch" },
  { id: "active", name: "Active character design" },
  { id: "story", name: "Current story strip" },
];

describe("drawing target selection", () => {
  it("keeps production batches on their exact session-owned document", () => {
    expect(chooseDrawingTarget(drawings, {
      productionSession: true,
      requestedDrawingId: "story",
      activeDrawingId: "active",
    })).toEqual({ id: "story", name: "Current story strip" });
  });

  it("never falls back to the active or first drawing when a production target is missing", () => {
    expect(chooseDrawingTarget(drawings, {
      productionSession: true,
      requestedDrawingId: "unsaved-story-target",
      activeDrawingId: "active",
    })).toBeUndefined();
    expect(chooseDrawingTarget(drawings, {
      productionSession: true,
      activeDrawingId: "active",
    })).toBeUndefined();
  });

  it("prefers the active canvas for an ordinary visual edit", () => {
    expect(chooseDrawingTarget(drawings, {
      productionSession: false,
      activeDrawingId: "active",
    })).toEqual({ id: "active", name: "Active character design" });
  });

  it("uses the newest saved drawing for an ordinary edit without an active target", () => {
    expect(chooseDrawingTarget(drawings, {
      productionSession: false,
      activeDrawingId: "missing",
    })).toEqual({ id: "recent", name: "Most recently saved sketch" });
  });
});
