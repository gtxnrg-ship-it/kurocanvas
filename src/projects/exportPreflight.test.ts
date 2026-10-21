import { describe, expect, it } from "vitest";
import { findMissingDrawingReferences } from "./exportPreflight";

describe("project export drawing preflight", () => {
  it("does not report drawing references that exist", () => {
    expect(findMissingDrawingReferences([
      { id: "m1", title: "Panel template", assetRefs: ["drawing:d1"] },
    ], ["d1"])).toEqual([]);
  });

  it("reports missing linked drawings instead of silently dropping them", () => {
    expect(findMissingDrawingReferences([
      { id: "m1", title: "Opening panel", assetRefs: ["drawing:gone"] },
    ], [])).toEqual([{ drawingId: "gone", memoryTitles: ["Opening panel"] }]);
  });

  it("deduplicates missing assets and preserves all referencing memory titles", () => {
    expect(findMissingDrawingReferences([
      { id: "m1", title: "Opening panel", assetRefs: ["drawing:gone", "drawing:gone"] },
      { id: "m2", title: "Character pose", assetRefs: ["drawing:gone"] },
    ], [])).toEqual([{
      drawingId: "gone",
      memoryTitles: ["Character pose", "Opening panel"],
    }]);
  });

  it("ignores non-drawing references but flags malformed drawing references", () => {
    expect(findMissingDrawingReferences([
      { id: "m1", title: "Notes", assetRefs: ["https://example.com/reference", "drawing:"] },
    ], [])).toEqual([]);
  });
});
