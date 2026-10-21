/**
 * Application-level stop for explicit chapter-recall requests with no approved
 * chapter memory. Prompt instructions alone cannot guarantee non-hallucination.
 */
export function missingChapterRecallMessage(query: string, hasMatchingApprovedMemory: boolean): string | undefined {
  if (hasMatchingApprovedMemory) return undefined;
  const chapter = query.match(/\b(?:chapter|ch\.?)\s*#?\s*(\d+)\b/i);
  if (!chapter) return undefined;
  const asksRecall = /\b(?:what happened|what was established|recap|summari[sz]e|remember what happened|do you remember|recall|bring back|retrieve|show me (?:the )?(?:exact|original|previous)|find (?:the )?(?:exact|original|previous)|flashback of (?:that|the|chapter)|previous panel|same panel|panel from)\b/i.test(query);
  if (!asksRecall) return undefined;
  return "I don't have matching approved story memory for Chapter " + chapter[1] + " in this project's vault. I won't invent events, dialogue, character changes, or panels. Add or import the chapter recap in Creative Vault, approve it, and ask again.";
}
