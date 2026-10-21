import type { ModelMessage } from "./modelRegistry";

type ConversationTurn = { role: "user" | "kuro"; text: string };

/**
 * Choose a bounded working context from the durable transcript.
 *
 * No finite model has a literally unlimited context window. Instead, keep the
 * newest exchange, reserve room for older turns that overlap the current request,
 * and leave the source transcript untouched. Durable canon/memory stores remain
 * the source of truth for project facts; this function is a conversation aid.
 */
export function buildKuroConversationTurns(
  messages: readonly ConversationTurn[],
  limit = 24,
  maxCharsPerMessage = 4000,
  currentQuery = "",
  maxTotalCharacters = 28000,
): ModelMessage[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.min(48, Math.floor(limit))) : 24;
  const safeChars = Number.isFinite(maxCharsPerMessage) ? Math.max(1, Math.min(12000, Math.floor(maxCharsPerMessage))) : 4000;
  const safeTotal = Number.isFinite(maxTotalCharacters) ? Math.max(1000, Math.min(48000, Math.floor(maxTotalCharacters))) : 28000;
  if (safeLimit === 0) return [];

  const prepared = messages.flatMap((message, index) => {
    if ((message.role !== "user" && message.role !== "kuro") || typeof message.text !== "string") return [];
    const original = message.text.trim();
    if (!original) return [];
    const clipped = original.length > safeChars
      ? original.slice(0, safeChars) + " …[earlier turn clipped for context]"
      : original;
    return [{ index, role: message.role, content: clipped }];
  });
  if (!prepared.length) return [];

  const candidates = prepared;
  if (candidates.length <= 1) {
    const latest = candidates[candidates.length - 1];
    return latest ? [{ role: latest.role === "user" ? "user" : "assistant", content: latest.content.slice(0, safeTotal) }] : [];
  }

  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
  const stopWords = new Set([
    "the","and","for","with","that","this","then","than","from","into","onto","your","you","are","was","were","have","has","had","will","would","could","should","can","not","but","all","any","how","what","when","where","who","why","which","our","their","they","them","she","her","him","his","its","about","please","make","want","need","just","like","also","there","here","because","really","very","more","some","thing","things","does","did","doing","been","being","get","got","let","lets","continue",
  ]);
  const queryTokens = new Set(normalize(currentQuery).split(/[^\p{L}\p{N}]+/u)
    .filter(token => token.length >= 2 && !stopWords.has(token)).slice(0, 80));
  const persistentIntent = /\b(?:remember|always|never|approved|canon|must|exact|important|the rule is|from now on|don't forget|do not forget|we decided|keep this|story bible|world bible|easter egg|foreshadow|cameo)\b/i;

  const score = (item: typeof candidates[number]) => {
    const body = normalize(item.content);
    const tokens = new Set(body.split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 2 && !stopWords.has(token)));
    let overlap = 0;
    for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
    const phraseHit = currentQuery.trim().length >= 8 && body.includes(normalize(currentQuery.trim()).slice(0, 60)) ? 5 : 0;
    const importance = persistentIntent.test(item.content) ? 3 : 0;
    const recency = item.index / Math.max(1, messages.length - 1);
    const userAuthorship = item.role === "user" ? 0.25 : 0;
    return overlap * 2 + phraseHit + importance + recency + userAuthorship;
  };

  const selected = new Map<number, typeof candidates[number]>();
  let used = 0;
  const add = (item: typeof candidates[number], remainingBudget = safeTotal - used) => {
    if (selected.has(item.index) || remainingBudget <= 0 || selected.size >= safeLimit) return;
    let content = item.content;
    if (content.length > remainingBudget) {
      if (selected.size > 0) return;
      content = content.slice(-remainingBudget);
    }
    if (!content.trim()) return;
    selected.set(item.index, { ...item, content });
    used += content.length;
  };

  // Give the recent exchange most of the budget, but not all of it.
  const recentBudget = Math.floor(safeTotal * 0.62);
  let recentUsed = 0;
  const recentFloor = Math.min(6, candidates.length, safeLimit);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const item = candidates[i];
    if (selected.size >= recentFloor && recentUsed >= recentBudget) break;
    const before = used;
    add(item);
    recentUsed += used - before;
    if (used >= safeTotal) break;
  }

  // Fill remaining room with the most relevant older turns, then restore chronology.
  const older = candidates.filter(item => !selected.has(item.index))
    .map(item => ({ item, score: score(item) }))
    .sort((a, b) => b.score - a.score || b.item.index - a.item.index);
  for (const candidate of older) add(candidate.item);

  return [...selected.values()]
    .sort((a, b) => a.index - b.index)
    .map(item => ({
      role: item.role === "user" ? "user" as const : "assistant" as const,
      content: item.content,
    }));
}
