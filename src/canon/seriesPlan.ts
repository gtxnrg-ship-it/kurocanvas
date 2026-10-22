export interface SeriesChapterApproval {
  chapterNumber: number;
  drawingId: string;
  approvedAt: string;
}

export interface SeriesChapterProgress {
  /** Approval state is valid only for this exact approved plan signature. */
  planSignature: string;
  approvedChapters: SeriesChapterApproval[];
}

export interface SeriesPlanFields {
  /** Narrative identity that the approved series outline is based on. */
  title?: string;
  premise?: string;
  genres?: string;
  seriesScope?: string;
  seriesArcPlan?: string;
  seriesChapterPlan?: string;
  seriesEnding?: string;
  seriesPlanApproved?: boolean;
  seriesPlanApprovalSignature?: string;
  seriesChapterProgress?: SeriesChapterProgress;
}

export interface SeriesPlanIssue {
  id: "scope" | "arcs" | "chapters" | "ending" | "chapter-order" | "chapter-count" | "approval";
  message: string;
}

export interface ParsedSeriesChapter {
  number: number;
  label: string;
  summary: string;
}

export interface SeriesPlanReport {
  valid: boolean;
  approved: boolean;
  chapterCount: number;
  chapters: ParsedSeriesChapter[];
  issues: SeriesPlanIssue[];
}

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/**
 * The plan signature binds approval to the exact scope, arc map, chapter list, and finale.
 * Editing any approved plan field invalidates approval without relying on UI state alone.
 */
export function seriesPlanSignature(fields: SeriesPlanFields): string {
  return JSON.stringify([
    clean(fields.title),
    clean(fields.premise),
    clean(fields.genres),
    clean(fields.seriesScope),
    clean(fields.seriesArcPlan),
    clean(fields.seriesChapterPlan).replace(/\r\n?/g, "\n").trim(),
    clean(fields.seriesEnding),
  ]);
}

/** One numbered chapter/episode per non-empty line, in release order from 1 to the finale. */
export function parseSeriesChapterPlan(value: unknown): ParsedSeriesChapter[] {
  const lines = clean(value).split(/\n/).map(line => line.trim()).filter(Boolean);
  const chapters: ParsedSeriesChapter[] = [];
  for (const line of lines) {
    const withoutBullet = line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "");
    const match = /^(chapter|episode|part|one[- ]shot)\s*(\d+)\s*[:.)-]\s*(.{40,})$/i.exec(withoutBullet);
    if (!match) return [];
    const number = Number(match[2]);
    if (!Number.isSafeInteger(number) || number < 1 || number > 500) return [];
    chapters.push({ number, label: match[1] + " " + number, summary: match[3].trim() });
  }
  return chapters;
}

/** Completeness is checked separately from creator approval so drafts remain editable. */
export function validateSeriesPlan(fields: SeriesPlanFields): SeriesPlanIssue[] {
  const issues: SeriesPlanIssue[] = [];
  const scope = clean(fields.seriesScope);
  const arcs = clean(fields.seriesArcPlan);
  const chapterText = clean(fields.seriesChapterPlan);
  const ending = clean(fields.seriesEnding);

  if (scope.length < 12) {
    issues.push({ id: "scope", message: "Describe the intended format, scope, audience, and approximate series length." });
  }
  if (arcs.length < 40) {
    issues.push({ id: "arcs", message: "Map the major story arcs, character changes, and how the stakes develop." });
  }
  if (ending.length < 40) {
    issues.push({ id: "ending", message: "Define the intended finale, major reveals, emotional resolution, and payoff of important setups." });
  }
  if (!chapterText) {
    issues.push({ id: "chapters", message: "List every chapter or episode from the opening through the finale, one numbered chapter per line." });
  } else {
    const lines = chapterText.split(/\n/).map(line => line.trim()).filter(Boolean);
    const chapters = parseSeriesChapterPlan(chapterText);
    if (!chapters.length || chapters.length !== lines.length) {
      issues.push({ id: "chapters", message: "Use one line per chapter in the form “Chapter 1: a meaningful summary of events and character change”. Label every line; summaries need at least 40 characters." });
    } else {
      const numbers = chapters.map(chapter => chapter.number);
      const expected = Array.from({ length: numbers.length }, (_, index) => index + 1);
      if (numbers.some((number, index) => number !== expected[index])) {
        issues.push({ id: "chapter-order", message: "Chapter numbers must be unique, gap-free, and ordered from 1 through the finale. Renumber the complete outline before approval." });
      }
      const declaredCount = /\b(\d{1,3})\s*[- ]?\s*(?:chapters?|episodes?|parts?|installments?)\b/i.exec(scope);
      if (declaredCount && Number(declaredCount[1]) !== chapters.length) {
        issues.push({ id: "chapter-count", message: "The scope declares " + Number(declaredCount[1]) + " chapters/episodes, but the outline contains " + chapters.length + ". Add the missing entries or correct the intended length." });
      } else if (!declaredCount && /\\b(?:standalone|one[- ]shot)\\b/i.test(scope) && chapters.length !== 1) {
        issues.push({ id: "chapter-count", message: "A standalone one-shot must have exactly one numbered chapter entry." });
      }
    }
  }
  return issues;
}

export function isSeriesPlanApproved(fields: SeriesPlanFields): boolean {
  return fields.seriesPlanApproved === true
    && clean(fields.seriesPlanApprovalSignature) !== ""
    && fields.seriesPlanApprovalSignature === seriesPlanSignature(fields)
    && validateSeriesPlan(fields).length === 0;
}

/** Retrieve one planned chapter only from a complete, currently approved series plan. */
export function resolveApprovedSeriesChapter(
  fields: SeriesPlanFields,
  chapterNumber: number | undefined,
): ParsedSeriesChapter | undefined {
  if (!Number.isSafeInteger(chapterNumber) || !chapterNumber || !isSeriesPlanApproved(fields)) return undefined;
  return parseSeriesChapterPlan(fields.seriesChapterPlan).find(chapter => chapter.number === chapterNumber);
}

export interface SeriesProductionDecision {
  allowed: boolean;
  complete: boolean;
  revision: boolean;
  targetChapterNumber?: number;
  expectedChapterNumber?: number;
  message?: string;
}

/** Completed chapter records are trusted only when attached to this exact approved plan. */
export function approvedSeriesChapterRecords(fields: SeriesPlanFields): SeriesChapterApproval[] {
  if (!isSeriesPlanApproved(fields)) return [];
  const progress = fields.seriesChapterProgress;
  if (!progress || progress.planSignature !== seriesPlanSignature(fields) || !Array.isArray(progress.approvedChapters)) return [];
  const known = new Set(parseSeriesChapterPlan(fields.seriesChapterPlan).map(chapter => chapter.number));
  const seen = new Set<number>();
  return progress.approvedChapters.filter(item => {
    if (!item || !Number.isSafeInteger(item.chapterNumber) || !known.has(item.chapterNumber)
      || seen.has(item.chapterNumber) || typeof item.drawingId !== "string" || !item.drawingId.trim()
      || typeof item.approvedAt !== "string" || !item.approvedAt.trim()) return false;
    seen.add(item.chapterNumber);
    return true;
  }).slice().sort((a, b) => a.chapterNumber - b.chapterNumber);
}

/** The first chapter that has not been explicitly reviewed and approved by the creator. */
export function nextSeriesChapterNumber(fields: SeriesPlanFields): number | undefined {
  if (!isSeriesPlanApproved(fields)) return undefined;
  const approved = new Set(approvedSeriesChapterRecords(fields).map(item => item.chapterNumber));
  return parseSeriesChapterPlan(fields.seriesChapterPlan).find(chapter => !approved.has(chapter.number))?.number;
}

/** Reject skipped chapters and require an explicit revision request to reopen approved work. */
export function evaluateSeriesProductionRequest(
  fields: SeriesPlanFields,
  requestedChapterNumber?: number,
  allowRevision = false,
  pendingReviewChapterNumber?: number,
): SeriesProductionDecision {
  if (!isSeriesPlanApproved(fields)) {
    return { allowed: false, complete: false, revision: false, message: "Approve the complete series plan before producing a chapter." };
  }

  const chapters = parseSeriesChapterPlan(fields.seriesChapterPlan);
  if (requestedChapterNumber !== undefined && !chapters.some(chapter => chapter.number === requestedChapterNumber)) {
    return {
      allowed: false, complete: false, revision: false,
      message: "Chapter " + requestedChapterNumber + " is not in the approved series outline. Add it to the plan and reapprove the full series first.",
    };
  }

  const approved = new Set(approvedSeriesChapterRecords(fields).map(item => item.chapterNumber));
  const expected = chapters.find(chapter => !approved.has(chapter.number));
  const target = requestedChapterNumber ?? expected?.number;
  const reopeningApproved = requestedChapterNumber !== undefined && approved.has(requestedChapterNumber) && allowRevision;
  const reopeningPending = requestedChapterNumber !== undefined
    && requestedChapterNumber === pendingReviewChapterNumber
    && allowRevision;

  if (target === undefined) {
    if (reopeningApproved) {
      return { allowed: true, complete: true, revision: true, targetChapterNumber: requestedChapterNumber };
    }
    return {
      allowed: false, complete: true, revision: false,
      message: "Every chapter in this series is reviewed and approved. To reopen a chapter, explicitly ask to revise that chapter; any later chapter approvals will need review again.",
    };
  }

  if (reopeningApproved || reopeningPending) {
    return {
      allowed: true, complete: false, revision: true,
      targetChapterNumber: requestedChapterNumber, expectedChapterNumber: expected?.number,
      message: "This is an explicit chapter revision. After a changed drawing batch is saved, this chapter and later approvals will be reopened for review.",
    };
  }

  if (expected && target === expected.number) {
    return {
      allowed: true, complete: false, revision: false,
      targetChapterNumber: target, expectedChapterNumber: expected.number,
    };
  }

  return {
    allowed: false, complete: false, revision: false,
    targetChapterNumber: target, expectedChapterNumber: expected?.number,
    message: expected
      ? target > expected.number
        ? "The next chapter is Chapter " + expected.number + ". Finish and approve each earlier chapter in order before starting Chapter " + target + "."
        : "Chapter " + target + " is already approved. To change it, explicitly ask to revise that chapter; later chapter approvals will then need review again."
      : "Every chapter is reviewed and approved. Explicitly request a revision to reopen earlier work.",
  };
}

/** Record creator approval only for the next chapter and its exact saved editable drawing. */
export function approveSeriesChapter(
  fields: SeriesPlanFields,
  chapterNumber: number,
  drawingId: string,
  approvedAt = new Date().toISOString(),
): SeriesPlanFields {
  if (!isSeriesPlanApproved(fields)) throw new Error("Approve the complete series plan before approving a chapter.");
  if (!drawingId.trim() || drawingId.length > 128) throw new Error("Open the saved chapter drawing before approving it.");
  if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) throw new Error("Choose a valid chapter number.");
  const expected = nextSeriesChapterNumber(fields);
  if (expected !== chapterNumber) throw new Error("Review chapters in order. The next chapter awaiting approval is " + (expected === undefined ? "none; the whole series is complete." : "Chapter " + expected + "."));
  const chapters = parseSeriesChapterPlan(fields.seriesChapterPlan);
  if (!chapters.some(chapter => chapter.number === chapterNumber)) throw new Error("This chapter is not part of the approved series plan.");
  const approvals = approvedSeriesChapterRecords(fields);
  return {
    ...fields,
    seriesChapterProgress: {
      planSignature: seriesPlanSignature(fields),
      approvedChapters: [...approvals, { chapterNumber, drawingId, approvedAt }].sort((a, b) => a.chapterNumber - b.chapterNumber),
    },
  };
}

/** Invalidate this chapter and all following approvals after an accepted revision changes the story. */
export function invalidateSeriesApprovalsFrom(
  fields: SeriesPlanFields,
  chapterNumber: number,
): SeriesPlanFields {
  if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) throw new Error("Choose a valid chapter number.");
  const approvals = approvedSeriesChapterRecords(fields).filter(item => item.chapterNumber < chapterNumber);
  return {
    ...fields,
    seriesChapterProgress: {
      planSignature: seriesPlanSignature(fields),
      approvedChapters: approvals,
    },
  };
}

export function evaluateSeriesPlan(fields: SeriesPlanFields): SeriesPlanReport {
  const chapters = parseSeriesChapterPlan(fields.seriesChapterPlan);
  const issues = validateSeriesPlan(fields);
  const valid = issues.length === 0;
  const approved = isSeriesPlanApproved(fields);
  if (valid && !approved) {
    issues.push({ id: "approval", message: "Review the complete outline and explicitly approve it before Kuro starts writing or drawing chapters." });
  }
  return { valid, approved, chapterCount: chapters.length, chapters, issues };
}

export function approveSeriesPlan(fields: SeriesPlanFields): SeriesPlanFields {
  const issues = validateSeriesPlan(fields);
  if (issues.length) throw new Error("Series plan cannot be approved yet: " + issues.map(issue => issue.message).join(" "));
  return { ...fields, seriesPlanApproved: true, seriesPlanApprovalSignature: seriesPlanSignature(fields) };
}

export function invalidateSeriesPlanApproval(fields: SeriesPlanFields): Pick<SeriesPlanFields, "seriesPlanApproved" | "seriesPlanApprovalSignature"> {
  return { seriesPlanApproved: false, seriesPlanApprovalSignature: "" };
}
