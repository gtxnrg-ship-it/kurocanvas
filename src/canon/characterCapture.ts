import type { CanonEntity } from "./universe";

export interface CharacterEntityCandidate {
  name?: string;
  evidence?: string;
  aliases?: string[];
}

/** Convert only exact, user-grounded introductions into proposed canon entities. */
export function proposeCharacterEntitiesFromEvidence(
  candidates: CharacterEntityCandidate[],
  userMessage: string,
  existing: CanonEntity[],
  projectId: string,
  createId: () => string,
): CanonEntity[] {
  const output: CanonEntity[] = [];
  for (const item of candidates.slice(0, 8)) {
    const evidence = typeof item.evidence === "string" ? item.evidence.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!evidence || !userMessage.includes(evidence) || !name || !evidence.includes(name)) continue;
    const duplicate = [...existing, ...output].some(entity =>
      entity.kind.toLocaleLowerCase() === "character" &&
      (entity.name.toLocaleLowerCase() === name.toLocaleLowerCase() ||
       entity.aliases.some(alias => alias.toLocaleLowerCase() === name.toLocaleLowerCase()))
    );
    if (duplicate) continue;
    const aliases = (Array.isArray(item.aliases) ? item.aliases : [])
      .filter((alias): alias is string => typeof alias === "string" && Boolean(alias.trim()) && evidence.includes(alias.trim()))
      .map(alias => alias.trim()).slice(0, 8);
    output.push({ id: createId(), projectId, kind: "character", name, aliases, status: "proposed" });
  }
  return output;
}
