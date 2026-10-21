import { describe, expect, it } from "vitest";
import { buildArtDirectionContext, createEmptyArtDirection, parseArtDirectionSynthesis, validateArtDirection } from "./artDirection";

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


  it("parses only editable fields from a structured synthesis draft", () => {
    const parsed = parseArtDirectionSynthesis(JSON.stringify({
      title: "Original urban romance",
      visualStyle: "Consistent expressive webtoon linework.",
      linework: "Stable contour hierarchy.",
      visualInvariants: "Scars persist after introduction.",
      projectId: "should-not-overwrite",
      influences: [{ id: "should-not-overwrite" }],
    }));
    expect(parsed.title).toBe("Original urban romance");
    expect(parsed.visualStyle).toContain("webtoon");
    expect((parsed as Record<string, unknown>).projectId).toBeUndefined();
    expect(parsed.influences).toBeUndefined();
  });

  it("recovers a fenced JSON draft and still enforces the core visual rules", () => {
    const parsed = parseArtDirectionSynthesis('Here is the draft:\n\`\`\`json\n{"title":"New identity","visualStyle":"Expressive linework","linework":"Stable contour hierarchy","visualInvariants":"Keep scars consistent"}\n\`\`\`');
    expect(parsed.title).toBe("New identity");
    expect(parsed.visualStyle).toBe("Expressive linework");
  });

  it("rejects malformed or incomplete art-direction synthesis", () => {
    expect(() => parseArtDirectionSynthesis("not json")).toThrow(/invalid JSON/i);
    expect(() => parseArtDirectionSynthesis(JSON.stringify({ title: "Incomplete" }))).toThrow(/core visual rules/i);
  });

  it("bounds context length and validates malformed influences", () => {
    const bible = createEmptyArtDirection("series-1");
    bible.visualStyle = "x".repeat(10000);
    expect(buildArtDirectionContext(bible, "series-1", 1000).length).toBeLessThanOrEqual(1000);
    bible.influences = [{ id: "bad" } as never];
    expect(validateArtDirection(bible, "series-1").join(" ")).toContain("Every influence needs");
  });
});
