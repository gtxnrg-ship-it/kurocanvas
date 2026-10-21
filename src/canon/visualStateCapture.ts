import type { CharacterVisualState } from "./styleBible";

export interface VisualStateCandidate {
  characterName?: string;
  evidence?: string;
  chapterNumber?: number;
  storyOrder?: number;
  age?: string;
  hair?: string;
  eyes?: string;
  scars?: string;
  outfit?: string;
  body?: string;
  accessories?: string;
  injuries?: string;
  other?: string;
}

/**
 * Converts model suggestions into safe proposals only when every key fact is
 * grounded in an exact quote from the user's message. The caller must keep
 * these records proposed; this function never approves canon.
 */
export function proposeVisualStatesFromEvidence(
  candidates: VisualStateCandidate[],
  userMessage: string,
  existing: CharacterVisualState[],
  createId: () => string,
): CharacterVisualState[] {
  const output: CharacterVisualState[] = [];
  const fields = ["age","hair","eyes","scars","outfit","body","accessories","injuries","other"] as const;
  for (const item of candidates.slice(0, 8)) {
    const evidence = typeof item.evidence === "string" ? item.evidence.trim() : "";
    const characterName = typeof item.characterName === "string" ? item.characterName.trim() : "";
    const chapterNumber = Number(item.chapterNumber);
    const chapterMatch = evidence.match(/\b(?:chapter|ch\.?)\s*#?\s*(\d+)\b/i);
    if (!evidence || !userMessage.includes(evidence) || !characterName || !evidence.includes(characterName) ||
        !chapterMatch || Number(chapterMatch[1]) !== chapterNumber || !Number.isFinite(chapterNumber) || chapterNumber < 0) continue;

    const visual: Record<string, string> = {};
    for (const field of fields) {
      const value = typeof item[field] === "string" ? item[field]!.trim() : "";
      if (value && evidence.includes(value)) visual[field] = value;
    }
    if (!fields.some(field => visual[field])) continue;

    const duplicate = [...existing, ...output].some(state =>
      state.status !== "superseded" &&
      state.characterName.toLocaleLowerCase() === characterName.toLocaleLowerCase() &&
      state.chapterNumber === chapterNumber &&
      state.sourceEvidence === evidence
    );
    if (duplicate) continue;

    output.push({
      id: createId(),
      characterName,
      chapterNumber,
      chapterLabel: "Chapter " + chapterNumber,
      // Chapter number is only a provisional timeline position. The user can
      // correct storyOrder for flashbacks or non-linear chronology before approval.
      storyOrder: chapterNumber,
      sourceEvidence: evidence,
      ...visual,
      status: "proposed",
    });
  }
  return output;
}
