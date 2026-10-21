import { describe, expect, it } from "vitest";
import { buildArtDirectionContext, createEmptyArtDirection, validateArtDirection } from "./artDirection";

describe("project art direction bible", () => {
  it("creates an empty project-scoped style contract", () => {
    const bible = createEmptyArtDirection("series-1");
    expect(bible.schemaVersion).toBe(1);
    expect(bible.projectId).toBe("series-1");
    expect(validateArtDirection(bible, "series-1")).toEqual([]);
  });

  it("refuses to attach another project's style bible", () => {
    const bible = createEmptyArtDirection("series-a");
    expect(() => buildArtDirectionContext(bible, "series-b")).toThrow(/different project/i);
  });

  it("keeps inspiration dimensions separate and makes persistent traits explicit", () => {
    const bible = createEmptyArtDirection("series-1");
    bible.agingAndScars = "A healed cheek scar persists in every later design.";
    bible.hairAndSilhouette = "Shoulder-length hair until a recorded haircut.";
    bible.influences = [{ id: "influence-1", work: "Example series", aspect: "friendship dynamics", notes: "Loyalty and rivalry with consequences." }];
    const context = buildArtDirectionContext(bible, "series-1");
    expect(context).toContain("PROJECT-LOCKED CONSTRAINTS");
    expect(context).toContain("A healed cheek scar persists");
    expect(context).toContain("Shoulder-length hair");
    expect(context).toContain("Example series → friendship dynamics");
    expect(context).toContain("do not reproduce exact characters");
  });

  it("bounds context length and validates malformed influences", () => {
    const bible = createEmptyArtDirection("series-1");
    bible.visualStyle = "x".repeat(10000);
    expect(buildArtDirectionContext(bible, "series-1", 1000).length).toBeLessThanOrEqual(1000);
    bible.influences = [{ id: "bad" } as never];
    expect(validateArtDirection(bible, "series-1").join(" ")).toContain("Every influence needs");
  });
});
