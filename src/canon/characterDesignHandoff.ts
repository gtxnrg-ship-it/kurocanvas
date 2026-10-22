import type { CanonBundle, CanonEntity } from "./universe";
import { createEmptyCanon } from "./universe";
import type { ProjectStyleBible, CharacterVisualState } from "./styleBible";
import { createEmptyStyleBible } from "./styleBible";
import type { StoryMemoryRecord } from "./storyMemory";

export type CharacterDesignTraits = Partial<Pick<
  CharacterVisualState,
  "age" | "hair" | "eyes" | "scars" | "outfit" | "body" | "accessories" | "injuries" | "other"
>>;

export interface CharacterDesignHandoffInput {
  projectId: string;
  drawingId: string;
  characterName: string;
  /** Existing approved/proposed character ID; omit to create a new proposed character. */
  existingEntityId?: string;
  aliases?: string[];
  chapterNumber?: number;
  /** Timeline position is provisional when the creator leaves it blank. */
  storyOrder?: number;
  traits: CharacterDesignTraits;
}

export interface CharacterDesignHandoffExisting {
  canon?: CanonBundle;
  styleBible?: ProjectStyleBible;
  storyMemories?: StoryMemoryRecord[];
}

export interface CharacterDesignHandoffResult {
  canon: CanonBundle;
  styleBible: ProjectStyleBible;
  storyMemory: StoryMemoryRecord;
  character: CanonEntity;
  visualState: CharacterVisualState;
}

const TRAIT_FIELDS = ["age", "hair", "eyes", "scars", "outfit", "body", "accessories", "injuries", "other"] as const;
const norm = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
const clean = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Links an editable drawing to a reviewable character entry.
 * Nothing created here is approved canon; explicit approval remains a Vault action.
 */
export function createCharacterDesignHandoff(
  input: CharacterDesignHandoffInput,
  existing: CharacterDesignHandoffExisting = {},
  options: { now?: string; createId?: () => string } = {},
): CharacterDesignHandoffResult {
  const projectId = clean(input.projectId, 256);
  const drawingId = clean(input.drawingId, 256);
  const enteredName = clean(input.characterName, 120);
  if (!projectId || !drawingId) throw new Error("Choose the active project and a saved drawing first.");
  if (!enteredName) throw new Error("Enter the character’s name before saving the design.");
  const canon = existing.canon ?? createEmptyCanon(projectId);
  const bible = existing.styleBible ?? createEmptyStyleBible(projectId);
  if (canon.projectId !== projectId || bible.projectId !== projectId) {
    throw new Error("The character, drawing, canon and visual bible must belong to the same active project.");
  }
  const assetRef = "drawing:" + drawingId;
  if ((existing.storyMemories ?? []).some(record =>
    record.projectId === projectId &&
    record.kind === "visual-reference" &&
    record.assetRefs.includes(assetRef)
  )) {
    throw new Error("This saved drawing is already linked to a World & Vault visual record.");
  }

  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? new Date().toISOString();
  const normalizedName = norm(enteredName);
  let character: CanonEntity;
  let nextEntities = [...canon.entities];

  if (input.existingEntityId) {
    const selected = canon.entities.find(entity =>
      entity.id === input.existingEntityId && entity.projectId === projectId && entity.kind.toLocaleLowerCase() === "character"
    );
    if (!selected) throw new Error("The selected character is not in this project. Reload the World Bible and try again.");
    if (norm(selected.name) !== normalizedName) throw new Error("The selected character name changed. Choose it again before saving.");
    character = selected;
  } else {
    const aliases = [...new Set((input.aliases ?? []).map(alias => clean(alias, 80)).filter(alias => alias && norm(alias) !== normalizedName))].slice(0, 12);
    const duplicate = canon.entities.some(entity => entity.projectId === projectId && entity.kind.toLocaleLowerCase() === "character" &&
      (norm(entity.name) === normalizedName || entity.aliases.some(alias => norm(alias) === normalizedName) ||
       aliases.some(alias => norm(alias) === norm(entity.name) || entity.aliases.some(other => norm(other) === norm(alias)))));
    if (duplicate) throw new Error("A character with this name or alias already exists. Select the existing character to create a new visual version.");
    character = { id: createId(), projectId, kind: "character", name: enteredName, aliases, status: "proposed" };
    nextEntities = [...nextEntities, character];
  }

  const traits: Record<string, string> = {};
  for (const field of TRAIT_FIELDS) {
    const value = clean(input.traits[field], 500);
    if (value) traits[field] = value;
  }
  if (!Object.keys(traits).length) throw new Error("Add at least one appearance detail (hair, eyes, outfit, scars, or another visual trait) before linking this design.");
  const chapterNumber = input.chapterNumber;
  if (chapterNumber !== undefined && (!Number.isInteger(chapterNumber) || chapterNumber < 0)) {
    throw new Error("Chapter number must be a non-negative whole number.");
  }
  if (input.storyOrder !== undefined && (!Number.isFinite(input.storyOrder) || input.storyOrder < 0)) {
    throw new Error("Story order must be a non-negative number.");
  }
  const existingTimelineStates = bible.characterStates.filter(state =>
    norm(state.characterName) === normalizedName && state.status !== "superseded"
  );
  if (input.existingEntityId && existingTimelineStates.length > 0
    && chapterNumber === undefined && input.storyOrder === undefined) {
    throw new Error("This character already has visual history. Set a chapter number or story order so the new design cannot be mistaken for the beginning of the story.");
  }
  const storyOrder = input.storyOrder ?? chapterNumber ?? 0;
  const timelineLabel = chapterNumber !== undefined
    ? "Chapter " + chapterNumber + " · proposed visual design"
    : input.storyOrder !== undefined
      ? "Story order " + input.storyOrder + " · proposed visual design"
      : "Initial design · baseline appearance";
  const visualState: CharacterVisualState = {
    id: createId(),
    characterName: character.name,
    storyOrder,
    chapterLabel: timelineLabel,
    ...(chapterNumber !== undefined ? { chapterNumber } : {}),
    ...traits,
    status: "proposed",
  };
  const designDetails = TRAIT_FIELDS.filter(field => traits[field]).map(field => field + ": " + traits[field]).join("; ");
  const styleBible: ProjectStyleBible = {
    ...bible,
    projectId,
    characterStates: [...bible.characterStates, visualState],
    updatedAt: now,
  };
  const nextCanon: CanonBundle = { ...canon, projectId, entities: nextEntities };

  const storyMemory: StoryMemoryRecord = {
    id: createId(),
    projectId,
    kind: "visual-reference",
    title: "Character design · " + character.name,
    summary: "Proposed visual design linked to the saved editable canvas. Appearance draft: " + designDetails +
      (chapterNumber !== undefined
        ? " Proposed for chapter " + chapterNumber + "; confirm chronology before approval."
        : input.storyOrder !== undefined
          ? " Proposed at story order " + input.storyOrder + "; confirm chronology before approval."
          : " Stored as the baseline starting appearance at provisional order 0; confirm story placement before approval.") +
      " This is a proposal, not approved canon.",
    ...(chapterNumber !== undefined ? { chapterNumber } : {}),
    ...(input.storyOrder !== undefined ? { storyOrder } : {}),
    entityIds: [character.id],
    tags: ["character-design", "visual-draft"],
    source: "user",
    status: "proposed",
    assetRefs: [assetRef],
    supersedes: [],
    createdAt: now,
    updatedAt: now,
  };
  return { canon: nextCanon, styleBible, storyMemory, character, visualState };
}
