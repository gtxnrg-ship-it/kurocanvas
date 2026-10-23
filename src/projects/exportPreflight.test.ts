import { describe, expect, it } from "vitest";
import { collectProjectExportDrawingIds, findMissingDrawingReferences, validateImportedDrawingEntries } from "./exportPreflight";

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
    ], [])).toEqual([{ drawingId: "(empty ID)", memoryTitles: ["Notes"] }]);
  });

  it("exports every saved drawing, including pages not linked from Story Vault", () => {
    expect(collectProjectExportDrawingIds([
      { id: "m1", title: "Opening panel", assetRefs: ["drawing:linked", "drawing:missing"] },
    ], ["unlinked-page", "linked"])).toEqual(["linked", "missing", "unlinked-page"]);
  });
});

describe("project drawing import preflight", () => {
  it("accepts distinct drawing IDs whose paths match their document IDs", () => {
    expect(() => validateImportedDrawingEntries([
      ["kuro/drawings/d1.json", JSON.stringify({ id: "d1", version: 1 })],
      ["kuro/drawings/d2.json", JSON.stringify({ id: "d2", version: 1 })],
      ["kuro/story-memory.v1.json", "not a drawing document"],
    ])).not.toThrow();
  });

  it("rejects duplicate drawing IDs before the import remapping map can overwrite one", () => {
    expect(() => validateImportedDrawingEntries([
      ["kuro/drawings/page-a.json", JSON.stringify({ id: "same-id" })],
      ["kuro/drawings/page-b.json", JSON.stringify({ id: "same-id" })],
    ])).toThrow(/duplicate drawing IDs/i);
  });

  it("rejects a drawing whose path and embedded ID disagree", () => {
    expect(() => validateImportedDrawingEntries([
      ["kuro/drawings/page-a.json", JSON.stringify({ id: "page-b" })],
    ])).toThrow(/file path does not match its internal ID/i);
  });

  it("rejects malformed drawing JSON during the preflight", () => {
    expect(() => validateImportedDrawingEntries([
      ["kuro/drawings/page-a.json", "{broken"],
    ])).toThrow(/not valid JSON/i);
  });
});
