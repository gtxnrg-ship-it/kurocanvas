import { parseModelJson } from "../ai/structuredOutput";
import { isSeriesPlanApproved, type SeriesPlanFields } from "./seriesPlan";

export interface ArtDirectionInfluence {
  id: string;
  work: string;
  aspect: string;
  notes: string;
}

export interface ArtDirectionBible {
  schemaVersion: 1;
  projectId: string;
  title: string;
  premise: string;
  genres: string;
  emotionalTone: string;
  relationshipDynamics: string;
  humorAndDialogue: string;
  groupDynamics: string;
  visualStyle: string;
  linework: string;
  rendering: string;
  palette: string;
  lighting: string;
  proportions: string;
  hairAndSilhouette: string;
  agingAndScars: string;
  outfitContinuity: string;
  visualInvariants: string;
  avoid: string;
  /** A complete outline covering every numbered chapter through the intended finale. */
  seriesScope?: string;
  seriesArcPlan?: string;
  seriesChapterPlan?: string;
  seriesEnding?: string;
  seriesPlanApproved?: boolean;
  seriesPlanApprovalSignature?: string;
  influences: ArtDirectionInfluence[];
  updatedAt: string;
}

export type ArtDirectionField = Exclude<keyof ArtDirectionBible, "schemaVersion" | "projectId" | "updatedAt" | "influences" | "seriesScope" | "seriesArcPlan" | "seriesChapterPlan" | "seriesEnding" | "seriesPlanApproved" | "seriesPlanApprovalSignature">;

const cleanText = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export const ART_DIRECTION_FIELDS: Array<{ key: ArtDirectionField; label: string; hint: string }> = [
  { key: "title", label: "Art direction name", hint: "A concise name for this project's unified creative identity." },
  { key: "premise", label: "Story premise and intended feeling", hint: "What the story is about and what readers should feel." },
  { key: "genres", label: "Genres and themes", hint: "Genre blend, themes, stakes, and intended audience." },
  { key: "emotionalTone", label: "Emotional tone", hint: "How serious, tender, tense, hopeful, or dark the story feels." },
  { key: "relationshipDynamics", label: "Relationship dynamics", hint: "Pacing, chemistry, conflict, affection, comedy beats, and emotional payoff." },
  { key: "humorAndDialogue", label: "Humor and dialogue", hint: "Timing, dub-like conversational rhythm, banter, and dialogue boundaries." },
  { key: "groupDynamics", label: "Friendship and ensemble", hint: "Group loyalty, rivalries, shared history, team energy, and consequences." },
  { key: "visualStyle", label: "Unified visual style", hint: "Describe the project's own coherent art direction in plain language." },
  { key: "linework", label: "Linework and shape language", hint: "Contour weight, sharp vs soft shapes, detail density, and facial line economy." },
  { key: "rendering", label: "Rendering and materials", hint: "Cel shading, painterly softness, texture, highlights, and finish." },
  { key: "palette", label: "Color palette", hint: "Core, accent, skin, shadow, and scene palette rules." },
  { key: "lighting", label: "Lighting and atmosphere", hint: "Light direction, contrast, time-of-day color, and mood cues." },
  { key: "proportions", label: "Character proportions", hint: "Height language, body proportions, face construction, and age-related changes." },
  { key: "hairAndSilhouette", label: "Hair and silhouette rules", hint: "Hair length, parting, volume, signature shapes, and silhouette anchors." },
  { key: "agingAndScars", label: "Aging, scars, and lasting changes", hint: "How time changes the body; permanent marks remain unless canon explicitly changes them." },
  { key: "outfitContinuity", label: "Outfit and prop continuity", hint: "Outfit states, accessories, injuries, carried items, and scene-to-scene changes." },
  { key: "visualInvariants", label: "Locked visual invariants", hint: "Traits that must not drift between panels, chapters, poses, or render passes." },
  { key: "avoid", label: "Never do / style drift guardrails", hint: "Contradictions, unwanted tropes, visual drift, and unsupported design inventions." },
];

export function createEmptyArtDirection(projectId: string): ArtDirectionBible {
  if (!projectId.trim()) throw new Error("A project ID is required for art direction.");
  return {
    schemaVersion: 1, projectId, title: "", premise: "", genres: "", emotionalTone: "",
    relationshipDynamics: "", humorAndDialogue: "", groupDynamics: "", visualStyle: "",
    linework: "", rendering: "", palette: "", lighting: "", proportions: "",
    hairAndSilhouette: "", agingAndScars: "", outfitContinuity: "", visualInvariants: "",
    avoid: "", seriesScope: "", seriesArcPlan: "", seriesChapterPlan: "", seriesEnding: "",
    seriesPlanApproved: false, seriesPlanApprovalSignature: "",
    influences: [], updatedAt: new Date(0).toISOString(),
  };
}

export function validateArtDirection(value: unknown, projectId?: string): string[] {
  if (!value || typeof value !== "object") return ["Art direction must be an object."];
  const bible = value as Partial<ArtDirectionBible>;
  const errors: string[] = [];
  if (bible.schemaVersion !== 1) errors.push("Unsupported art direction schema version.");
  if (typeof bible.projectId !== "string" || !bible.projectId.trim()) errors.push("A project ID is required.");
  if (projectId && bible.projectId !== projectId) errors.push("Art direction belongs to a different project.");
  for (const { key } of ART_DIRECTION_FIELDS) if (typeof bible[key] !== "string") errors.push("Art direction field " + key + " must be text.");
  if (!Array.isArray(bible.influences)) errors.push("Art direction influences must be a list.");
  else for (const influence of bible.influences) {
    if (!influence || typeof influence.id !== "string" || typeof influence.work !== "string" || typeof influence.aspect !== "string" || typeof influence.notes !== "string") {
      errors.push("Every influence needs an ID, work, aspect, and notes.");
      break;
    }
  }
  for (const key of ["seriesScope", "seriesArcPlan", "seriesChapterPlan", "seriesEnding", "seriesPlanApprovalSignature"] as const) {
    if (bible[key] !== undefined && typeof bible[key] !== "string") errors.push("Series-plan field " + key + " must be text.");
  }
  if (bible.seriesPlanApproved !== undefined && typeof bible.seriesPlanApproved !== "boolean") errors.push("Series-plan approval must be a boolean.");
  if (typeof bible.updatedAt !== "string") errors.push("Art direction needs an update timestamp.");
  return errors;
}

/**
 * Builds strict creative constraints for model prompts. Inspiration is decomposed
 * into separate craft dimensions; it must never become permission to copy a work.
 */
export function buildArtDirectionContext(bible: ArtDirectionBible | undefined, projectId: string, maxCharacters = 6000): string {
  if (!bible) return "";
  const errors = validateArtDirection(bible, projectId);
  if (errors.length) throw new Error("Art direction refused: " + errors.join(" "));
  const entries: Array<[string, string]> = [
    ["Project identity", bible.title], ["Premise", bible.premise], ["Genres/themes", bible.genres],
    ["Emotional tone", bible.emotionalTone], ["Relationship dynamics", bible.relationshipDynamics],
    ["Humor/dialogue", bible.humorAndDialogue], ["Friendship/ensemble", bible.groupDynamics],
    ["Unified visual style", bible.visualStyle], ["Linework/shape language", bible.linework],
    ["Rendering/materials", bible.rendering], ["Palette", bible.palette], ["Lighting", bible.lighting],
    ["Proportions", bible.proportions], ["Hair/silhouette", bible.hairAndSilhouette],
    ["Aging/scars", bible.agingAndScars], ["Outfit/prop continuity", bible.outfitContinuity],
    ["Locked visual invariants", bible.visualInvariants], ["Avoid", bible.avoid],
  ];
  const lines = [
    "PROJECT ART-DIRECTION BIBLE — PROJECT-LOCKED CONSTRAINTS",
    "This is the controlling art direction for the active project. Preserve it across every chapter, panel, character sheet, model sheet, and revision.",
    "Never silently change the style, character proportions, hair length/parting, palette, linework, shading, scars, age, or outfit state. Check approved canon and chronological character history first.",
    "A scar, haircut, age, injury, accessory, or outfit changes only when supported by the current scene or approved chronological history. Persistent changes carry forward after their introduction unless canon records a later change.",
    "Treat each inspiration below as a narrow reference for its named craft dimension only. Synthesize broad qualities into an original cohesive project style; do not reproduce exact characters, signature designs, panels, dialogue, compositions, or branding from a referenced work.",
    "If a locked detail is missing or contradictory, ask for clarification or mark it unknown instead of inventing a replacement.",
  ];
  const seriesPlan: SeriesPlanFields = {
    title: bible.title, premise: bible.premise, genres: bible.genres,
    seriesScope: bible.seriesScope ?? "", seriesArcPlan: bible.seriesArcPlan ?? "",
    seriesChapterPlan: bible.seriesChapterPlan ?? "", seriesEnding: bible.seriesEnding ?? "",
    seriesPlanApproved: bible.seriesPlanApproved ?? false,
    seriesPlanApprovalSignature: bible.seriesPlanApprovalSignature ?? "",
  };
  if ([seriesPlan.seriesScope, seriesPlan.seriesArcPlan, seriesPlan.seriesChapterPlan, seriesPlan.seriesEnding].some(value => cleanText(value))) {
    lines.push(isSeriesPlanApproved(seriesPlan)
      ? "WHOLE-SERIES PLAN — CREATOR-APPROVED. Preserve this plan through the finale. Chapter production must follow the numbered sequence; do not silently skip, reorder, or invent payoff outcomes."
      : "WHOLE-SERIES PLAN — DRAFT ONLY, NOT APPROVED. Help the creator revise it, but do not treat it as locked canon or start chapter writing/drawing.");
    if (cleanText(seriesPlan.seriesScope)) lines.push("Series scope and format: " + cleanText(seriesPlan.seriesScope));
    if (cleanText(seriesPlan.seriesArcPlan)) lines.push("Series arcs and character journeys: " + cleanText(seriesPlan.seriesArcPlan));
    if (cleanText(seriesPlan.seriesChapterPlan)) lines.push("Complete chapter/episode sequence (one numbered entry per chapter):\n" + cleanText(seriesPlan.seriesChapterPlan));
    if (cleanText(seriesPlan.seriesEnding)) lines.push("Planned finale and payoff map: " + cleanText(seriesPlan.seriesEnding));
  }
  for (const [label, value] of entries) if (value.trim()) lines.push(label + ": " + value.trim());
  const influences = bible.influences.filter(item => item.work.trim() && item.aspect.trim());
  if (influences.length) {
    lines.push("INSPIRATION MAP — KEEP DIMENSIONS SEPARATE");
    for (const item of influences) lines.push("- " + item.work.trim() + " → " + item.aspect.trim() + (item.notes.trim() ? ": " + item.notes.trim() : ""));
    lines.push("Do not let one inspiration overwrite unrelated dimensions. Resolve conflicts in favor of the project's explicitly saved unified style and locked invariants.");
  }
  const limit = Math.max(500, Math.min(12000, Math.floor(maxCharacters)));
  let result = lines.join("\n");
  if (result.length > limit) result = result.slice(0, limit - 40).trimEnd() + "\n[Art direction context truncated.]";
  return result;
}

/** Parse a model draft into editable art-direction fields without accepting metadata or influence mutations. */
export function parseArtDirectionSynthesis(rawText: string): Partial<ArtDirectionBible> {
  if (rawText.length > 64_000) throw new Error("The art-direction draft exceeds the response-size limit.");
  let value: unknown;
  try { value = parseModelJson(rawText, 64_000); }
  catch { throw new Error("Kuro returned invalid JSON for the art-direction draft (after structured-output recovery)."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Kuro did not return a structured art-direction draft.");
  const source = value as Record<string, unknown>;
  const result: Partial<ArtDirectionBible> = {};
  for (const field of ART_DIRECTION_FIELDS) {
    const candidate = source[field.key];
    if (typeof candidate === "string") (result as unknown as Record<string, unknown>)[field.key] = candidate.trim();
  }
  if (!result.visualStyle?.trim() || !result.visualInvariants?.trim() || !result.linework?.trim()) {
    throw new Error("The draft is missing core visual rules. Retry or complete those fields manually.");
  }
  return result;
}
