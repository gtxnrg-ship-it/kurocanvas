import { retrieveCanon, type CanonBundle } from "./universe";

export interface CanonContextOptions {
  projectId: string;
  userMessage: string;
  maxFacts?: number;
  maxCharacters?: number;
}

/**
 * Builds a bounded, project-scoped context block for an AI request.
 * Only approved canon is included: proposals and inferences must never silently
 * become facts the assistant presents as true.
 */
export function buildApprovedCanonContext(
  bundle: CanonBundle | undefined,
  options: CanonContextOptions,
): string {
  if (!bundle) return "";
  if (!options.projectId.trim()) throw new Error("Choose a project before retrieving canon.");
  if (bundle.projectId !== options.projectId) {
    throw new Error("Canon context refused: the saved World Bible does not belong to the active project.");
  }

  const maxFacts = Math.max(1, Math.min(80, Math.floor(options.maxFacts ?? 24)));
  const maxCharacters = Math.max(500, Math.min(12000, Math.floor(options.maxCharacters ?? 5000)));
  const retrieved = retrieveCanon(bundle, {
    projectId: options.projectId,
    text: options.userMessage,
    statuses: ["approved"],
    limit: maxFacts,
  });
  if (!retrieved.entities.length || !retrieved.facts.length) return "";

  const entityNames = new Map(retrieved.entities.map(entity => [entity.id, entity.name]));
  const lines: string[] = [
    "PROJECT WORLD BIBLE — APPROVED CANON ONLY",
    "Treat the following as established facts for this project. Do not invent missing details or promote proposals to canon.",
    "If a relevant fact is absent or ambiguous, say it is not established in the saved World Bible.",
  ];
  for (const entity of retrieved.entities) {
    lines.push(`Character/world entity: ${entity.name} (${entity.kind})`);
  }
  for (const fact of retrieved.facts) {
    const subject = entityNames.get(fact.subjectId) ?? retrieved.entities.find(e => e.id === fact.subjectId)?.name ?? fact.subjectId;
    let value: string;
    try { value = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value); }
    catch { value = String(fact.value); }
    lines.push(`- ${subject} — ${fact.predicate}: ${value ?? "null"}${fact.storyOrder === undefined ? "" : ` (story order ${fact.storyOrder})`}`);
  }
  let output = lines.join("\n");
  if (output.length > maxCharacters) {
    output = output.slice(0, maxCharacters - 24).trimEnd() + "\n[Context truncated.]";
  }
  return output;
}
