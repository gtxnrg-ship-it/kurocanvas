import { parseStoryChapterNumber } from "./storyCoordinates";
/**
 * Application-level stop for explicit chapter-recall requests with no approved
 * chapter memory. Prompt instructions alone cannot guarantee non-hallucination.
 */
export function missingChapterRecallMessage(query: string, hasMatchingApprovedMemory: boolean): string | undefined {
  if (hasMatchingApprovedMemory) return undefined;
  const carriesSourceText = query.length > 120 && (/\b(?:here(?:'s| is)|recap|summary|notes|excerpt|text below)\b/i.test(query) || /\bchapter\s*#?\d+\s*[:—-]/i.test(query));
  if (carriesSourceText) return undefined;
  const chapterNumber = parseStoryChapterNumber(query);
  if (chapterNumber === undefined) return undefined;
  const asksRecall = /\b(?:what happened|what was established|recap|summari[sz]e|remember what happened|do you remember|recall|bring back|retrieve|show me (?:the )?(?:exact|original|previous)|find (?:the )?(?:exact|original|previous)|flashback of (?:that|the|chapter)|previous panel|same panel|panel from)\b/i.test(query);
  if (!asksRecall) return undefined;
  return "I don't have matching approved story memory for Chapter " + chapterNumber + " in this project's vault. I won't invent events, dialogue, character changes, or panels. Add or import the chapter recap in Creative Vault, approve it, and ask again.";
}
