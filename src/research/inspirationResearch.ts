export interface CreativeInfluenceResearchRequest {
  /** Title or named source work exactly as written by the user. */
  work: string;
  /** Element the user wants to study and transform, not copy verbatim. */
  aspect: string;
  /** Search term used by the source-backed research provider. */
  query: string;
}

const INSPIRATION_ACTION = /\b(?:borrow(?:ing)?|take(?:\s+some)?\s+inspiration|take|draw(?:ing)?\s+inspiration|inspired\s+by|adapt(?:ing)?|use|using|reference|model\s+after|base(?:d)?\s+on|influence(?:d)?)\b/i;
const CREATIVE_TOPIC = /\b(?:character|relationship|friendship|gang|leadership|power\s+system|art\s+style|visual\s+style|design|worldbuilding|world-building|world|story|plot|fight|costume|outfit|aesthetic|camera|panel|narrative|anime|manga|series|influence|dynamics|theme|dialogue)\b/i;
const NEGATED_INSPIRATION = /\b(?:don't|do not|never|not yet|not|let's not|avoid)\b[\s\S]{0,90}\b(?:borrow|take(?:\s+some)?\s+inspiration|take|draw(?:ing)?\s+inspiration|inspired\s+by|inspired|adapt|use|reference|model\s+after|base(?:d)?\s+on|influence(?:d)?)\b/i;
const FROM_WORK = /\b(?:from|by)\s+(?:([“"])([^"”]{2,80})["”]|([\p{Lu}][\p{L}\p{N}'’:&.-]*(?:\s+(?:[\p{Lu}][\p{L}\p{N}'’:&.-]*|x|of|the|and|no|to|in|for|on|at)){0,4})(?=\s*(?:[,.;!?]|$|\b(?:and|for|to|with|because|while|as)\b|\p{Ll})))/gu;

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
const GENERIC_ASPECT = /^(?:this|that|it|them|those|these|something|the same|everything|something like that)$/i;
const IGNORED_WORKS = new Set(["you", "me", "us", "them", "myself", "yourself", "ourselves"]);

/**
 * Recognize a user asking to borrow a *creative ingredient* from one or more named works.
 * Only the research is automatic: source notes are never silently promoted to canon and the
 * downstream brief is to transform high-level techniques into original work rather than copy.
 */
export function extractCreativeInfluenceResearch(message: string): CreativeInfluenceResearchRequest[] {
  const text = message.normalize("NFKC").trim();
  if (!text || !INSPIRATION_ACTION.test(text) || !CREATIVE_TOPIC.test(text) || NEGATED_INSPIRATION.test(text)) return [];

  const matches = [...text.matchAll(FROM_WORK)];
  if (!matches.length) return [];
  const output: CreativeInfluenceResearchRequest[] = [];
  const seen = new Set<string>();
  let previousEnd = 0;

  for (const match of matches.slice(0, 8)) {
    const work = (match[2] ?? match[3] ?? "").replace(/^[“"]|[”"]$/g, "").replace(/['’]s$/i, "").replace(/[.,;:!?]+$/g, "").replace(/(?:\s+(?:of|the|and|no|to|in|for|on|at))+$/i, "").trim();
    if (work.length < 2 || work.length > 80 || IGNORED_WORKS.has(normalized(work))) {
      previousEnd = (match.index ?? previousEnd) + match[0].length;
      continue;
    }
    const key = normalized(work);
    if (seen.has(key)) {
      previousEnd = (match.index ?? previousEnd) + match[0].length;
      continue;
    }

    let aspect = text.slice(previousEnd, match.index ?? previousEnd)
      .replace(/^[\s,;:]+/g, "")
      .replace(/^\s*(?:(?:and|then|also|next|finally|plus|as well as)\b[\s,]*)+/i, "")
      .replace(/[\s,;:]+$/g, "")
      .trim();

    const action = /\b(?:take(?:\s+some)?\s+inspiration|borrow(?:ing)?|adapt(?:ing)?|use|using|take|draw(?:ing)?\s+inspiration|inspired|reference|model\s+after|base(?:d)?\s+on|influence(?:d)?)\b\s*/ig;
    let lastAction: RegExpExecArray | null = null;
    let actionMatch: RegExpExecArray | null;
    while ((actionMatch = action.exec(aspect))) lastAction = actionMatch;
    if (lastAction) aspect = aspect.slice(lastAction.index + lastAction[0].length).trim();
    aspect = aspect.replace(/^(?:from|by)\s+/i, "").replace(/[\s,;:]+$/g, "").trim();

    if (!aspect || GENERIC_ASPECT.test(aspect)) {
      aspect = "the relevant character dynamics, visual language, themes, and narrative techniques discussed in the conversation";
    } else {
      aspect = aspect.replace(/^(?:this|that)\s+/i, "").slice(0, 100);
    }

    output.push({ work, aspect, query: work });
    seen.add(key);
    previousEnd = (match.index ?? previousEnd) + match[0].length;
  }
  return output;
}
