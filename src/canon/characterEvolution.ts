/**
 * Temporal character canon for long-running stories.
 *
 * A character identity persists while their body, appearance, health and visual assets
 * can change over time. Approved snapshots are immutable historical inputs; the resolver
 * carries forward unspecified fields, applies explicit unknowns, and never crosses a
 * universe/timeline or reveal boundary.
 */
export type EvolutionCanonStatus = "approved" | "proposed" | "superseded";
export type HairLength = "shaved" | "very-short" | "short" | "chin" | "shoulder" | "mid-back" | "waist" | "floor" | "variable" | "unknown";
export type BodyIncarnationKind = "original" | "reincarnation" | "resurrection" | "possession" | "transformation" | "clone" | "other";
export type BodyIdentityContinuity = "same-person" | "different-person" | "shared-body" | "uncertain";
export type MemoryContinuity = "full" | "partial" | "none" | "uncertain";
export type PhysicalConditionKind = "bruise" | "cut" | "open-wound" | "fracture" | "sprain" | "burn" | "swelling" | "dental-injury" | "illness" | "scar" | "other";
export type PhysicalConditionStage = "fresh" | "active" | "healing" | "healed" | "permanent" | "unknown";

export interface CharacterBodyIdentity {
  /** Stable ID for this particular physical body, not for the person/soul. */
  bodyInstanceId: string;
  incarnationKind: BodyIncarnationKind;
  identityContinuity: BodyIdentityContinuity;
  memoryContinuity?: MemoryContinuity;
  previousBodyInstanceId?: string;
  previousIdentityId?: string;
  /** Age of this body when acquired, if known. */
  ageAtIncarnation?: number;
  notes?: string[];
}

export interface PhysicalConditionState {
  /** Keep the same ID while one wound progresses across later snapshots. */
  id: string;
  kind: PhysicalConditionKind;
  label: string;
  bodyRegion: string;
  stage: PhysicalConditionStage;
  /** Original injury severity, 1 (minor) through 5 (critical); this does not shrink as it heals. */
  severity: number;
  firstSeenStoryOrder: number;
  healingProgressPercent?: number;
  painLevel?: number;
  visibleDescription: string;
  functionalImpact?: string;
  permanentMark?: boolean;
  residualEffects?: string[];
  notes?: string[];
}

/** Fields a later snapshot may deliberately mark as unknown instead of inheriting. */
export type CharacterAppearanceField =
  | "ageYears" | "height" | "build" | "faceAndFeatures" | "hairStyle" | "hairLength"
  | "hairColor" | "eyeColor" | "skinTone" | "outfitId" | "outfitDescription"
  | "scarsAndMarks" | "injuries" | "accessories" | "voiceAndMannerisms"
  | "abilitiesAndSkills" | "personalityChanges" | "visualNotes" | "bodyIdentity" | "physicalConditions";

export interface CharacterAppearanceState {
  /** Explicit age for this state, when known; do not infer it from chapter number. */
  ageYears?: number;
  height?: string;
  build?: string;
  faceAndFeatures?: string;
  hairStyle?: string;
  hairLength?: HairLength;
  hairColor?: string;
  eyeColor?: string;
  skinTone?: string;
  outfitId?: string;
  outfitDescription?: string;
  scarsAndMarks?: string[];
  /** Legacy summary. Structured physicalConditions are authoritative when present. */
  injuries?: string[];
  accessories?: string[];
  voiceAndMannerisms?: string[];
  abilitiesAndSkills?: string[];
  personalityChanges?: string[];
  visualNotes?: string[];
  bodyIdentity?: CharacterBodyIdentity;
  /**
   * Complete current condition roster at this story point.
   * Omitted means inherit the previous approved roster; [] explicitly means none.
   * A condition must remain listed with its updated stage until resolved/cleared.
   */
  physicalConditions?: PhysicalConditionState[];
  /** Missing fields inherit; list a field here to explicitly erase prior knowledge. */
  unknownFields?: CharacterAppearanceField[];
}

export interface CharacterEvolutionState {
  id: string;
  universeId: string;
  characterId: string;
  timelineId: string;
  /** Monotonically increasing order within this timeline; not necessarily chapter number. */
  storyOrder: number;
  chapterNumber?: number;
  sceneNumber?: number;
  /** Optional hard spoiler gate for a character's first reveal; independent of preload order. */
  revealAtStoryOrder?: number;
  /** In-world date, ISO YYYY-MM-DD, if the story calendar has an exact date. */
  inWorldDate?: string;
  /** Optional stable state this snapshot replaces; historical snapshots remain available. */
  previousStateId?: string;
  status: EvolutionCanonStatus;
  appearance: CharacterAppearanceState;
  emotionalAndBehavioralState?: string;
  relationshipStateRefs: string[];
  assetRefs: string[];
  sourceMessageIds: string[];
  changeSummary: string;
  createdAt: string;
}

const STATUSES: readonly EvolutionCanonStatus[] = ["approved", "proposed", "superseded"];
const HAIR_LENGTHS: readonly HairLength[] = ["shaved", "very-short", "short", "chin", "shoulder", "mid-back", "waist", "floor", "variable", "unknown"];
const BODY_INCARNATION_KINDS: readonly BodyIncarnationKind[] = ["original", "reincarnation", "resurrection", "possession", "transformation", "clone", "other"];
const BODY_IDENTITY_CONTINUITIES: readonly BodyIdentityContinuity[] = ["same-person", "different-person", "shared-body", "uncertain"];
const MEMORY_CONTINUITIES: readonly MemoryContinuity[] = ["full", "partial", "none", "uncertain"];
const CONDITION_KINDS: readonly PhysicalConditionKind[] = ["bruise", "cut", "open-wound", "fracture", "sprain", "burn", "swelling", "dental-injury", "illness", "scar", "other"];
const CONDITION_STAGES: readonly PhysicalConditionStage[] = ["fresh", "active", "healing", "healed", "permanent", "unknown"];
const APPEARANCE_FIELDS: readonly CharacterAppearanceField[] = [
  "ageYears", "height", "build", "faceAndFeatures", "hairStyle", "hairLength", "hairColor", "eyeColor",
  "skinTone", "outfitId", "outfitDescription", "scarsAndMarks", "injuries", "accessories",
  "voiceAndMannerisms", "abilitiesAndSkills", "personalityChanges", "visualNotes", "bodyIdentity", "physicalConditions",
];
const optionalStrings = (value: unknown) => value === undefined || typeof value === "string";
const stringArray = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");

export function validateCharacterEvolutionState(value: unknown, expectedUniverseId?: string): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["Character evolution state must be an object."];
  const state = value as Partial<CharacterEvolutionState>;
  for (const key of ["id", "universeId", "characterId", "timelineId", "changeSummary", "createdAt"] as const) {
    if (typeof state[key] !== "string" || !state[key]!.trim()) errors.push("Character evolution state needs " + key + ".");
  }
  if (expectedUniverseId && state.universeId !== expectedUniverseId) errors.push("Character evolution state belongs to another universe.");
  if (!Number.isFinite(state.storyOrder)) errors.push("Character story order must be finite.");
  if (state.revealAtStoryOrder !== undefined && (!Number.isFinite(state.revealAtStoryOrder) || state.revealAtStoryOrder < 0)) errors.push("Character reveal order must be a finite non-negative number.");
  if (state.chapterNumber !== undefined && (!Number.isInteger(state.chapterNumber) || state.chapterNumber < 0)) errors.push("Chapter number must be a non-negative integer.");
  if (state.sceneNumber !== undefined && (!Number.isInteger(state.sceneNumber) || state.sceneNumber < 0)) errors.push("Scene number must be a non-negative integer.");
  if (state.inWorldDate !== undefined && (typeof state.inWorldDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(state.inWorldDate) || Number.isNaN(Date.parse(state.inWorldDate + "T00:00:00Z")))) errors.push("In-world date must be an ISO YYYY-MM-DD date.");
  if (state.previousStateId !== undefined && (typeof state.previousStateId !== "string" || !state.previousStateId.trim() || state.previousStateId === state.id)) errors.push("Previous state reference is invalid.");
  if (!STATUSES.includes(state.status as EvolutionCanonStatus)) errors.push("Character evolution canon status is invalid.");
  if (!state.appearance || typeof state.appearance !== "object" || Array.isArray(state.appearance)) {
    errors.push("Character appearance snapshot is required.");
  } else {
    const appearance = state.appearance as CharacterAppearanceState;
    if (appearance.ageYears !== undefined && (!Number.isFinite(appearance.ageYears) || appearance.ageYears < 0 || appearance.ageYears > 10000)) errors.push("Character age must be a plausible non-negative numeric value.");
    for (const key of ["height", "build", "faceAndFeatures", "hairStyle", "hairColor", "eyeColor", "skinTone", "outfitId", "outfitDescription"] as const) {
      if (!optionalStrings(appearance[key])) errors.push("Appearance field " + key + " must be text when provided.");
    }
    if (appearance.hairLength !== undefined && !HAIR_LENGTHS.includes(appearance.hairLength)) errors.push("Hair length value is invalid.");
    for (const key of ["scarsAndMarks", "injuries", "accessories", "voiceAndMannerisms", "abilitiesAndSkills", "personalityChanges", "visualNotes"] as const) {
      if (appearance[key] !== undefined && !stringArray(appearance[key])) errors.push("Appearance field " + key + " must be a list of text.");
    }
    if (appearance.unknownFields !== undefined) {
      if (!Array.isArray(appearance.unknownFields) || appearance.unknownFields.some(field => !APPEARANCE_FIELDS.includes(field))) {
        errors.push("Appearance unknownFields contains an unsupported field.");
      } else {
        for (const field of appearance.unknownFields) {
          if (appearance[field] !== undefined) errors.push("Appearance field " + field + " cannot be both recorded and explicitly unknown.");
        }
      }
    }
    if (appearance.bodyIdentity !== undefined) {
      const body = appearance.bodyIdentity;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        errors.push("Body identity must be an object.");
      } else {
        if (typeof body.bodyInstanceId !== "string" || !body.bodyInstanceId.trim()) errors.push("Body identity needs a stable body instance ID.");
        if (!BODY_INCARNATION_KINDS.includes(body.incarnationKind)) errors.push("Body incarnation kind is invalid.");
        if (!BODY_IDENTITY_CONTINUITIES.includes(body.identityContinuity)) errors.push("Body identity continuity is invalid.");
        if (body.memoryContinuity !== undefined && !MEMORY_CONTINUITIES.includes(body.memoryContinuity)) errors.push("Body memory continuity is invalid.");
        if (body.previousBodyInstanceId !== undefined && (typeof body.previousBodyInstanceId !== "string" || !body.previousBodyInstanceId.trim() || body.previousBodyInstanceId === body.bodyInstanceId)) errors.push("Previous body instance reference is invalid.");
        if (body.previousIdentityId !== undefined && (typeof body.previousIdentityId !== "string" || !body.previousIdentityId.trim())) errors.push("Previous identity reference is invalid.");
        if (body.ageAtIncarnation !== undefined && (!Number.isFinite(body.ageAtIncarnation) || body.ageAtIncarnation < 0 || body.ageAtIncarnation > 10000)) errors.push("Body age at incarnation is invalid.");
        if (body.notes !== undefined && !stringArray(body.notes)) errors.push("Body identity notes must be a list of text.");
      }
    }
    if (appearance.physicalConditions !== undefined) {
      if (!Array.isArray(appearance.physicalConditions)) {
        errors.push("Physical conditions must be a list.");
      } else {
        const seen = new Set<string>();
        for (const condition of appearance.physicalConditions) {
          if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
            errors.push("A physical condition must be an object.");
            continue;
          }
          if (typeof condition.id !== "string" || !condition.id.trim()) errors.push("A physical condition needs a stable ID.");
          else if (seen.has(condition.id)) errors.push("Physical condition IDs must be unique within a snapshot.");
          else seen.add(condition.id);
          if (!CONDITION_KINDS.includes(condition.kind)) errors.push("Physical condition kind is invalid.");
          if (typeof condition.label !== "string" || !condition.label.trim()) errors.push("Physical condition needs a label.");
          if (typeof condition.bodyRegion !== "string" || !condition.bodyRegion.trim()) errors.push("Physical condition needs a body region.");
          if (!CONDITION_STAGES.includes(condition.stage)) errors.push("Physical condition stage is invalid.");
          if (!Number.isInteger(condition.severity) || condition.severity < 1 || condition.severity > 5) errors.push("Physical condition severity must be an integer from 1 to 5.");
          if (!Number.isFinite(condition.firstSeenStoryOrder) || condition.firstSeenStoryOrder < 0 || condition.firstSeenStoryOrder > (Number.isFinite(state.storyOrder) ? state.storyOrder! : -Infinity)) errors.push("Physical condition first-seen order must be non-negative and no later than this snapshot.");
          if (condition.healingProgressPercent !== undefined && (!Number.isFinite(condition.healingProgressPercent) || condition.healingProgressPercent < 0 || condition.healingProgressPercent > 100)) errors.push("Physical condition healing progress must be between 0 and 100.");
          if (condition.stage === "healed" && condition.healingProgressPercent !== undefined && condition.healingProgressPercent !== 100) errors.push("A healed condition must have 100% healing progress when progress is specified.");
          if (condition.painLevel !== undefined && (!Number.isFinite(condition.painLevel) || condition.painLevel < 0 || condition.painLevel > 10)) errors.push("Physical condition pain level must be between 0 and 10.");
          if (typeof condition.visibleDescription !== "string" || !condition.visibleDescription.trim()) errors.push("Physical condition needs a visible description.");
          if (condition.functionalImpact !== undefined && typeof condition.functionalImpact !== "string") errors.push("Physical condition functional impact must be text.");
          if (condition.permanentMark !== undefined && typeof condition.permanentMark !== "boolean") errors.push("Physical condition permanent-mark flag must be boolean.");
          if (condition.residualEffects !== undefined && !stringArray(condition.residualEffects)) errors.push("Physical condition residual effects must be a list of text.");
          if (condition.notes !== undefined && !stringArray(condition.notes)) errors.push("Physical condition notes must be a list of text.");
        }
      }
    }
  }
  if (!optionalStrings(state.emotionalAndBehavioralState)) errors.push("Emotional/behavioral state must be text.");
  for (const key of ["relationshipStateRefs", "assetRefs", "sourceMessageIds"] as const) {
    if (!stringArray(state[key])) errors.push(key + " must be a list of strings.");
  }
  return [...new Set(errors)];
}

function approvedForCharacter(
  states: readonly CharacterEvolutionState[], universeId: string, characterId: string, timelineId: string,
): CharacterEvolutionState[] {
  return states.filter(state => state.universeId === universeId && state.characterId === characterId
    && state.timelineId === timelineId && state.status === "approved"
    && validateCharacterEvolutionState(state, universeId).length === 0);
}

function revealOrderFor(states: readonly CharacterEvolutionState[], universeId: string, characterId: string, timelineId: string): number | undefined {
  const approved = approvedForCharacter(states, universeId, characterId, timelineId);
  if (!approved.length) return undefined;
  const explicit = [...new Set(approved.flatMap(state => state.revealAtStoryOrder === undefined ? [] : [state.revealAtStoryOrder]))];
  if (explicit.length > 1) {
    throw new Error("Conflicting approved reveal gates exist for character " + characterId + " on timeline " + timelineId + ".");
  }
  // When no explicit gate exists, the first approved state is the default first-appearance gate.
  return explicit[0] ?? Math.min(...approved.map(state => state.storyOrder));
}

export type CharacterRevealStatus = "hidden" | "available" | "unknown";

/** A preloaded character is hidden until the approved hard gate, even if assets/states were prepared early. */
export function characterRevealStatusAt(
  states: readonly CharacterEvolutionState[], universeId: string, characterId: string, timelineId: string, targetStoryOrder: number,
): CharacterRevealStatus {
  if (!universeId.trim() || !characterId.trim() || !timelineId.trim() || !Number.isFinite(targetStoryOrder)) {
    throw new Error("Character reveal lookup needs a universe, character, timeline, and finite story order.");
  }
  const approved = approvedForCharacter(states, universeId, characterId, timelineId);
  if (!approved.length) return "unknown";
  const revealOrder = revealOrderFor(states, universeId, characterId, timelineId);
  return revealOrder !== undefined && targetStoryOrder < revealOrder ? "hidden" : "available";
}

/** Resolve the latest approved snapshot at a point in one timeline, carrying forward omitted fields. */
export function characterStateAt(
  states: readonly CharacterEvolutionState[],
  universeId: string,
  characterId: string,
  timelineId: string,
  targetStoryOrder: number,
): CharacterEvolutionState | undefined {
  if (!universeId.trim() || !characterId.trim() || !timelineId.trim() || !Number.isFinite(targetStoryOrder)) {
    throw new Error("Character state lookup needs a universe, character, timeline, and finite story order.");
  }
  const allApproved = approvedForCharacter(states, universeId, characterId, timelineId);
  if (!allApproved.length || characterRevealStatusAt(states, universeId, characterId, timelineId, targetStoryOrder) === "hidden") return undefined;
  const eligible = allApproved.filter(state => state.storyOrder <= targetStoryOrder)
    .sort((a, b) => a.storyOrder - b.storyOrder || a.createdAt.localeCompare(b.createdAt));
  if (!eligible.length) return undefined;
  const latestOrder = eligible[eligible.length - 1].storyOrder;
  const latestStates = eligible.filter(state => state.storyOrder === latestOrder);
  if (latestStates.length > 1) {
    throw new Error("Ambiguous approved character canon: multiple states exist for character " + characterId
      + " on timeline " + timelineId + " at story order " + latestOrder + ". Resolve the conflict before drawing.");
  }

  const mergedAppearance: Record<string, unknown> = {};
  const explicitlyUnknown = new Set<CharacterAppearanceField>();
  let emotionalAndBehavioralState: string | undefined;
  for (const snapshot of eligible) {
    for (const [field, value] of Object.entries(snapshot.appearance)) {
      if (field === "unknownFields" || value === undefined) continue;
      mergedAppearance[field] = structuredClone(value);
      explicitlyUnknown.delete(field as CharacterAppearanceField);
    }
    for (const field of snapshot.appearance.unknownFields ?? []) {
      delete mergedAppearance[field];
      explicitlyUnknown.add(field);
    }
    if (snapshot.emotionalAndBehavioralState !== undefined) emotionalAndBehavioralState = snapshot.emotionalAndBehavioralState;
  }
  if (explicitlyUnknown.size) mergedAppearance.unknownFields = [...explicitlyUnknown];

  return {
    ...structuredClone(latestStates[0]),
    appearance: mergedAppearance as CharacterAppearanceState,
    ...(emotionalAndBehavioralState === undefined ? {} : { emotionalAndBehavioralState }),
  };
}

/** Compute age only when both dates are established; returns undefined rather than guessing. */
export function ageOnInWorldDate(birthDate: string | undefined, inWorldDate: string | undefined): number | undefined {
  const validDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  if (!validDate(birthDate) || !validDate(inWorldDate)) return undefined;
  if (inWorldDate! < birthDate!) return undefined;
  const born = birthDate!.split("-").map(Number);
  const now = inWorldDate!.split("-").map(Number);
  let age = now[0] - born[0];
  if (now[1] < born[1] || (now[1] === born[1] && now[2] < born[2])) age--;
  return age;
}

/** Explain the differences between two snapshots. Use this for an art-review delta, not temporal resolution. */
export function diffCharacterAppearance(
  before: CharacterEvolutionState | undefined,
  after: CharacterEvolutionState,
): Array<{ field: string; before: string; after: string }> {
  const fields: Array<keyof CharacterAppearanceState> = [
    "ageYears", "height", "build", "faceAndFeatures", "hairStyle", "hairLength", "hairColor",
    "eyeColor", "skinTone", "outfitId", "outfitDescription", "scarsAndMarks", "injuries",
    "accessories", "voiceAndMannerisms", "abilitiesAndSkills", "personalityChanges", "visualNotes",
    "bodyIdentity", "physicalConditions", "unknownFields",
  ];
  const format = (value: unknown) => value === undefined ? "unknown/not recorded"
    : typeof value === "string" ? value : JSON.stringify(value);
  return fields.flatMap(field => {
    const oldValue = before?.appearance[field];
    const newValue = after.appearance[field];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];
    return [{ field, before: format(oldValue), after: format(newValue) }];
  });
}

/** Build a compact, time-specific visual brief; unknown fields remain explicitly unknown. */
export function buildCharacterStateBrief(state: CharacterEvolutionState | undefined, targetStoryOrder: number): string {
  if (!state) return "CHARACTER CONTINUITY: No approved appearance state is recorded at story order " + targetStoryOrder + ". Do not invent age, body, outfit, hair, scars, or physical changes; request a reference or mark them unknown.";
  const a = state.appearance;
  const unknown = (field: CharacterAppearanceField) => a.unknownFields?.includes(field) ?? false;
  const show = (field: CharacterAppearanceField, value: unknown, fallback = "unknown") =>
    unknown(field) ? "explicitly unknown" : value === undefined || value === "" ? fallback : Array.isArray(value) ? value.join(", ") || "none recorded" : String(value);
  const body = a.bodyIdentity;
  const bodyLine = body
    ? [
        "Body instance: " + body.bodyInstanceId,
        "Incarnation: " + body.incarnationKind,
        "Person/identity continuity: " + body.identityContinuity,
        "Memory continuity: " + (body.memoryContinuity ?? "unknown"),
        "Previous body: " + (body.previousBodyInstanceId ?? "none recorded"),
        "Previous identity: " + (body.previousIdentityId ?? "none recorded"),
        "Body age at incarnation: " + (body.ageAtIncarnation ?? "unknown"),
        "Body notes: " + (body.notes?.join("; ") || "none recorded"),
      ].join("; ")
    : "Body/incarnation: unknown — do not assume the current body is the original body if a transfer, reincarnation, possession or transformation is established elsewhere.";
  const conditionLines = a.physicalConditions?.length
    ? a.physicalConditions.map(condition =>
        "- " + condition.label + " [" + condition.id + "; " + condition.kind + "; " + condition.stage + "]"
        + "; location: " + condition.bodyRegion
        + "; original severity: " + condition.severity + "/5"
        + "; healing: " + (condition.healingProgressPercent === undefined ? "unknown" : condition.healingProgressPercent + "%")
        + "; pain: " + (condition.painLevel === undefined ? "unknown" : condition.painLevel + "/10")
        + "; visible now: " + condition.visibleDescription
        + "; functional impact: " + (condition.functionalImpact ?? "not recorded")
        + "; permanent mark: " + (condition.permanentMark === undefined ? "unknown" : condition.permanentMark ? "yes" : "no")
        + (condition.residualEffects?.length ? "; residual effects: " + condition.residualEffects.join(", ") : "")
        + (condition.notes?.length ? "; notes: " + condition.notes.join("; ") : "")
      )
    : a.physicalConditions !== undefined ? ["- none recorded at this story point; retain historical snapshots, but do not redraw a healed injury as active"]
    : a.injuries?.length ? a.injuries.map(injury => "- legacy injury note: " + injury)
    : ["- no structured condition lifecycle is recorded; absence of notes is not proof that a prior injury healed"];
  const lines = [
    "CHARACTER STATE (approved canon; timeline " + state.timelineId + ", story order " + state.storyOrder + "):",
    "Character ID: " + state.characterId,
    "Age: " + show("ageYears", a.ageYears),
    "Height/build: " + [show("height", a.height), show("build", a.build)].join(" / "),
    "Face/features: " + show("faceAndFeatures", a.faceAndFeatures),
    "Hair: " + [show("hairColor", a.hairColor), show("hairLength", a.hairLength), show("hairStyle", a.hairStyle)].join(", "),
    "Eyes/skin: " + [show("eyeColor", a.eyeColor), show("skinTone", a.skinTone)].join(" / "),
    "Outfit: " + [show("outfitId", a.outfitId, "none recorded"), show("outfitDescription", a.outfitDescription, "none recorded")].join(" — "),
    "Scars/marks: " + show("scarsAndMarks", a.scarsAndMarks, "not recorded"),
    "Injuries (legacy summary): " + (a.physicalConditions !== undefined ? "superseded by the structured physical-condition lifecycle below" : show("injuries", a.injuries, "none recorded")),
    "Structured physical-condition lifecycle:",
    ...conditionLines,
    bodyLine,
    "Accessories: " + show("accessories", a.accessories, "none recorded"),
    "Voice/mannerisms: " + show("voiceAndMannerisms", a.voiceAndMannerisms),
    "Abilities/skills: " + show("abilitiesAndSkills", a.abilitiesAndSkills),
    "Behavior/personality at this point: " + (state.emotionalAndBehavioralState ?? show("personalityChanges", a.personalityChanges)),
    "Visual notes: " + show("visualNotes", a.visualNotes, "none recorded"),
    "Change summary: " + state.changeSummary,
    "Do not apply a later body, age, injury stage, scar, outfit or character state to a flashback or earlier scene.",
    "Unspecified appearance fields inherit the last approved value. A field explicitly marked unknown is not known. An explicit empty list clears that list; omission alone never means healed, removed or retconned.",
  ];
  return lines.join("\n");
}
