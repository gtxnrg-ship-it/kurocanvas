import type { CanonBundle, CanonEntity } from "./universe";

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","been","but","by","can","could","did","do","does","for","from","had","has","have","how","i","in","into","is","it","its","me","my","of","on","or","our","please","she","should","so","that","the","their","them","there","these","they","this","to","was","we","were","what","when","where","which","who","why","will","with","would","you","your"
]);

function terms(value: string): Set<string> {
  return new Set((value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter(word => !STOP_WORDS.has(word)));
}

function valueAsText(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return (typeof text === "string" ? text : String(value)).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function score(text: string, query: Set<string>): number {
  if (!query.size) return 0;
  const haystack = terms(text);
  let result = 0;
  for (const term of query) if (haystack.has(term)) result += 1;
  return result;
}

export interface ApprovedCanonContextOptions {
  maxEntities?: number;
  maxFacts?: number;
}

/** Builds bounded prompt context from approved canon in one selected project only. */
export function buildApprovedCanonContext(
  bundle: CanonBundle | undefined,
  projectId: string,
  userMessage: string,
  options: ApprovedCanonContextOptions = {},
): string {
  if (!projectId.trim()) throw new Error("Choose a project before building its canon context.");
  if (!bundle) {
    return "PROJECT CANON NOTE: This project has no saved world bible yet. Treat details not explicitly established by the user as unknown; ask when a canon decision matters.";
  }
  if (bundle.projectId !== projectId) {
    throw new Error("Canon context is restricted to the selected project.");
  }

  const maxEntities = Math.max(1, Math.min(20, Math.floor(options.maxEntities ?? 10)));
  const maxFacts = Math.max(1, Math.min(24, Math.floor(options.maxFacts ?? 14)));
  const approvedEntities = bundle.entities.filter(entity =>
    entity.projectId === projectId && entity.status === "approved"
  );
  const entityById = new Map(approvedEntities.map(entity => [entity.id, entity]));
  const query = terms(userMessage);
  const entityScores = new Map<string, number>();
  for (const entity of approvedEntities) {
    const entityScore = score([entity.name, ...entity.aliases].join(" "), query) * 3;
    if (entityScore > 0) entityScores.set(entity.id, entityScore);
  }

  const eligibleFacts = bundle.facts.filter(fact =>
    fact.projectId === projectId &&
    fact.status === "approved" &&
    entityById.has(fact.subjectId)
  );
  const rankedFacts = eligibleFacts.map((fact, index) => {
    const entity = entityById.get(fact.subjectId)!;
    const text = [fact.predicate, valueAsText(fact.value)].join(" ");
    return {
      fact,
      index,
      score: (entityScores.get(entity.id) ?? 0) + score(text, query) * 2,
      valueText: valueAsText(fact.value),
      entity,
    };
  }).sort((a, b) =>
    b.score - a.score ||
    (b.fact.storyOrder ?? -1) - (a.fact.storyOrder ?? -1) ||
    a.index - b.index
  );

  const chosenFacts = rankedFacts.slice(0, maxFacts);
  const chosenEntityIds = new Set(chosenFacts.map(item => item.entity.id));
  const matchingEntities = approvedEntities
    .filter(entity => entityScores.has(entity.id))
    .sort((a, b) =>
      (entityScores.get(b.id) ?? 0) - (entityScores.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name)
    );
  const entityOrder = [
    ...matchingEntities,
    ...approvedEntities.filter(entity => chosenEntityIds.has(entity.id) && !entityScores.has(entity.id)),
    ...approvedEntities.filter(entity => !chosenEntityIds.has(entity.id) && !entityScores.has(entity.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const uniqueEntities = [...new Map(entityOrder.map(entity => [entity.id, entity])).values()].slice(0, maxEntities);
  const visibleEntityIds = new Set(uniqueEntities.map(entity => entity.id));
  const visibleFacts = chosenFacts.filter(item => visibleEntityIds.has(item.entity.id));

  if (!uniqueEntities.length && !visibleFacts.length) {
    return "PROJECT CANON NOTE: No approved canon records exist for this project yet. Proposed ideas and inferred details are not established truth; treat unspecified details as unknown and ask when a canon decision matters.";
  }

  const lines = [
    "PROJECT CANON CONTEXT — approved records only. These records belong exclusively to the currently selected project.",
    "Treat absent details as unknown, not false. Do not invent conflicting facts or silently promote suggestions to canon. If the user's request conflicts with these records, flag the conflict and ask whether to propose a retcon.",
    "Approved entities:",
    ...uniqueEntities.map((entity: CanonEntity) =>
      "- " + entity.kind + ": " + entity.name + (entity.aliases.length ? " (aliases: " + entity.aliases.join(", ").slice(0, 180) + ")" : "")
    ),
    "Approved facts:",
    ...visibleFacts.map(({ fact, entity, valueText }) =>
      "- " + entity.name + " — " + fact.predicate + ": " + valueText + (fact.storyOrder !== undefined ? " (story order: " + fact.storyOrder + ")" : "")
    ),
  ];
  return lines.join("\n");
}
