import { describe, expect, it } from "vitest";
import { findLinkedDrawingRef, isExactPanelRecallRequest, missingExactPanelAssetMessage } from "./panelRecall";

describe("exact panel recall", () => {
  it("recognizes explicit requests to restore an existing panel", () => {
    expect(isExactPanelRecallRequest("Bring back the exact panel from chapter 7")).toBe(true);
    expect(isExactPanelRecallRequest("Open the saved drawing for the duel scene")).toBe(true);
    expect(isExactPanelRecallRequest("Design a brand new panel layout")).toBe(false);
  });

  it("selects only a linked drawing reference", () => {
    expect(findLinkedDrawingRef(["template:vertical-splash", "drawing:drawing-123"])).toBe("drawing:drawing-123");
    expect(findLinkedDrawingRef(["template:vertical-splash", "reference:ref-4"])).toBeUndefined();
  });

  it("refuses to claim an exact restore when no drawing asset is linked", () => {
    expect(missingExactPanelAssetMessage("Bring back the exact panel from chapter 7", [])).toContain("can't restore the exact original panel");
    expect(missingExactPanelAssetMessage("Bring back the exact panel from chapter 7", ["drawing:drawing-123"])).toBeUndefined();
    expect(missingExactPanelAssetMessage("Write a new panel for chapter 7", [])).toBeUndefined();
  });
});
