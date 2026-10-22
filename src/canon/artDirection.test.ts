import { describe, expect, it } from "vitest";
import { buildArtDirectionContext, createEmptyArtDirection, parseArtDirectionSynthesis, validateArtDirection } from "./artDirection";
import { approveSeriesPlan } from "./seriesPlan";

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


  it("passes the whole-series plan to Kuro as draft until its exact contents are approved", () => {
    const bible = createEmptyArtDirection("series-1");
    Object.assign(bible, {
      seriesScope: "A 3-episode vertical mystery comic with a complete ending.",
      seriesArcPlan: "The opening introduces the lead and the mystery. The middle escalates the investigation and costs the lead an important friendship. The final arc resolves the core question and relationship.",
      seriesChapterPlan: [
        "Chapter 1: The lead discovers a strange signal and hides it from a close friend.",
        "Chapter 2: The investigation exposes a family secret and breaks the friends' trust.",
        "Chapter 3: The lead reveals the truth, resolves the mystery, and repairs the friendship.",
      ].join("\n"),
      seriesEnding: "The finale explains the signal, pays off the opening clue, restores trust, and shows the lasting change in the community.",
    });
    expect(buildArtDirectionContext(bible, "series-1")).toContain("WHOLE-SERIES PLAN — DRAFT ONLY, NOT APPROVED");
    const approved = { ...bible, ...approveSeriesPlan(bible) };
    expect(buildArtDirectionContext(approved, "series-1")).toContain("WHOLE-SERIES PLAN — CREATOR-APPROVED");
    expect(buildArtDirectionContext(approved, "series-1")).toContain("Chapter 3:");
  });

  it("keeps the planned finale available before long chapter lists are truncated", () => {
    const bible = createEmptyArtDirection("series-1");
    Object.assign(bible, {
      title: "Lantern Coast",
      premise: "Two friends investigate a broken sky.",
      genres: "Fantasy mystery",
      seriesScope: "A 40-episode vertical fantasy mystery.",
      seriesArcPlan: "A long-form mystery that escalates through four major arcs and pays off its early clues.",
      seriesEnding: "FINAL CLUE: Mira returns the first lantern to the observatory and the sky heals because both friends tell the truth.",
      seriesChapterPlan: Array.from({ length: 40 }, (_, index) =>
        "Chapter " + (index + 1) + ": " + ("A lengthy chapter summary which preserves character motivation, reveals, visual continuity, and meaningful consequences. ").repeat(3)
      ).join("\n"),
    });
    const context = buildArtDirectionContext(bible, "series-1", 1200);
    expect(context).toContain("FINAL CLUE:");
    expect(context).not.toContain("Chapter 40:");
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
