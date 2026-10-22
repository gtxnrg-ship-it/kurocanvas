export interface SeriesPlanFields {
  seriesScope?: string;
  seriesArcPlan?: string;
  seriesChapterPlan?: string;
  seriesEnding?: string;
  seriesPlanApproved?: boolean;
  seriesPlanApprovalSignature?: string;
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
    const match = /^(chapter|episode|part|one[- ]shot)\s*(\d+)\s*[:.)-]\s*(.{12,})$/i.exec(withoutBullet);
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
      const declaredCount = /\\b(\\d{1,3})\\s*[- ]?\\s*(?:chapters?|episodes?|parts?|installments?)\\b/i.exec(scope);
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
