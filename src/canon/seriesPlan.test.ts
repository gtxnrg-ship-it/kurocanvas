import { describe, expect, it } from "vitest";
import {
  approveSeriesPlan,
  evaluateSeriesPlan,
  invalidateSeriesPlanApproval,
  isSeriesPlanApproved,
  parseSeriesChapterPlan,
  resolveApprovedSeriesChapter,
  seriesPlanSignature,
  validateSeriesPlan,
  type SeriesPlanFields,
} from "./seriesPlan";

const completeDraft: SeriesPlanFields = {
  seriesScope: "A 3-episode vertical fantasy mystery for teen and adult readers.",
  seriesArcPlan: "Arc 1 establishes the city and friendship; Arc 2 reveals the observatory conspiracy; Arc 3 tests the cast's loyalties and costs; the final arc resolves the sky mystery and changes the city.",
  seriesChapterPlan: [
    "Chapter 1: Mira discovers a lantern that glows under the eclipsed sky and hides it from Ren.",
    "Chapter 2: Ren notices the missing observatory key and confronts Mira about their broken trust.",
    "Chapter 3: The pair enter the sealed observatory and discover evidence of the first eclipse.",
  ].join("\n"),
  seriesEnding: "The finale reveals why the sky broke, resolves Mira and Ren's trust, pays off the lantern clue, and closes the central mystery while showing the city beginning to rebuild.",
  seriesPlanApproved: false,
  seriesPlanApprovalSignature: "",
};

describe("whole-series plan contract", () => {
  it("parses explicit numbered chapters in release order", () => {
    expect(parseSeriesChapterPlan(completeDraft.seriesChapterPlan).map(chapter => chapter.number)).toEqual([1, 2, 3]);
    expect(validateSeriesPlan(completeDraft)).toEqual([]);
    expect(evaluateSeriesPlan(completeDraft).valid).toBe(true);
    expect(evaluateSeriesPlan(completeDraft).approved).toBe(false);
  });

  it("requires complete scope, arc map, all numbered chapters, and a finale", () => {
    const report = evaluateSeriesPlan({});
    expect(report.valid).toBe(false);
    expect(report.issues.map(issue => issue.id)).toEqual(expect.arrayContaining(["scope", "arcs", "chapters", "ending"]));
  });

  it("rejects missing or repeated chapter numbers instead of pretending the series is complete", () => {
    const gap = { ...completeDraft, seriesChapterPlan: completeDraft.seriesChapterPlan!.replace("Chapter 2:", "Chapter 4:") };
    expect(validateSeriesPlan(gap).map(issue => issue.id)).toContain("chapter-order");
    const duplicate = { ...completeDraft, seriesChapterPlan: completeDraft.seriesChapterPlan!.replace("Chapter 2:", "Chapter 1:") };
    expect(validateSeriesPlan(duplicate).map(issue => issue.id)).toContain("chapter-order");
  });

  it("checks the declared series length and rejects placeholder chapter summaries", () => {
    const lengthMismatch = { ...completeDraft, seriesScope: "A 5-episode vertical fantasy mystery for teen and adult readers." };
    expect(validateSeriesPlan(lengthMismatch).map(issue => issue.id)).toContain("chapter-count");
    const placeholder = { ...completeDraft, seriesScope: "A standalone one-shot comic with a complete ending.", seriesChapterPlan: "Chapter 1: Too short." };
    const issues = validateSeriesPlan(placeholder);
    expect(issues.map(issue => issue.id)).toContain("chapters");
    expect(issues.find(issue => issue.id === "chapters")?.message).toContain("40 characters");
  });

  it("requires explicit approval and ties approval to the exact saved plan contents", () => {
    const approved = approveSeriesPlan(completeDraft);
    expect(isSeriesPlanApproved(approved)).toBe(true);
    expect(evaluateSeriesPlan(approved).approved).toBe(true);
    expect(isSeriesPlanApproved({ ...approved, seriesEnding: approved.seriesEnding + " Changed." })).toBe(false);
    expect(seriesPlanSignature(approved)).not.toBe(seriesPlanSignature({ ...approved, seriesScope: "A different scope" }));
  });

  it("retrieves the exact requested chapter only from an approved full-series plan", () => {
    expect(resolveApprovedSeriesChapter(completeDraft, 2)).toBeUndefined();
    const approved = approveSeriesPlan(completeDraft);
    expect(resolveApprovedSeriesChapter(approved, 2)).toMatchObject({
      number: 2,
      summary: expect.stringContaining("missing observatory key"),
    });
    expect(resolveApprovedSeriesChapter(approved, 99)).toBeUndefined();
    expect(resolveApprovedSeriesChapter(approved, undefined)).toBeUndefined();
  });

  it("invalidates approval explicitly whenever the creator edits the outline", () => {
    const approved = approveSeriesPlan(completeDraft);
    const invalidated = { ...approved, ...invalidateSeriesPlanApproval(approved), seriesChapterPlan: approved.seriesChapterPlan!.replace("Mira discovers a lantern", "Mira follows a faint lantern") };
    expect(isSeriesPlanApproved(invalidated)).toBe(false);
    expect(evaluateSeriesPlan(invalidated).issues.map(issue => issue.id)).toContain("approval");
  });

  it("accepts a single-chapter one-shot as a complete work", () => {
    const oneShot: SeriesPlanFields = {
      ...completeDraft,
      seriesScope: "A standalone one-shot comic, one chapter, complete ending.",
      seriesChapterPlan: "Chapter 1: Two estranged friends repair their broken radio before dawn and finally talk.",
    };
    expect(validateSeriesPlan(oneShot)).toEqual([]);

    const invalidOneShot = { ...oneShot, seriesChapterPlan: completeDraft.seriesChapterPlan };
    expect(validateSeriesPlan(invalidOneShot).map(issue => issue.id)).toContain("chapter-count");
  });
});
