import { describe, expect, it } from "vitest";
import {
  ageOnInWorldDate,
  buildCharacterStateBrief,
  characterRevealStatusAt,
  characterStateAt,
  diffCharacterAppearance,
  validateCharacterEvolutionState,
  type CharacterEvolutionState,
  type PhysicalConditionState,
} from "./characterEvolution";

const state = (overrides: Partial<CharacterEvolutionState> = {}): CharacterEvolutionState => ({
  id: "state-1", universeId: "u1", characterId: "c1", timelineId: "main", storyOrder: 10,
  status: "approved", appearance: { ageYears: 16, hairLength: "short", hairColor: "black" },
  relationshipStateRefs: [], assetRefs: ["ref-young"], sourceMessageIds: ["msg-1"],
  changeSummary: "Initial school-age design", createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

const armFracture = (overrides: Partial<PhysicalConditionState> = {}): PhysicalConditionState => ({
  id: "left-arm-fracture", kind: "fracture", label: "Left forearm fracture", bodyRegion: "left forearm",
  stage: "active", severity: 4, firstSeenStoryOrder: 10, healingProgressPercent: 10, painLevel: 8,
  visibleDescription: "swollen forearm held close to the body, bruising around the break",
  functionalImpact: "cannot bear weight or grip firmly", permanentMark: false, ...overrides,
});

describe("character evolution canon", () => {
  it("rejects cross-universe states and invalid story order", () => {
    expect(validateCharacterEvolutionState(state(), "u2")).toContain("Character evolution state belongs to another universe.");
    expect(validateCharacterEvolutionState(state({ storyOrder: Number.NaN }))).toContain("Character story order must be finite.");
  });

  it("resolves only approved states at or before the requested point and only in the selected timeline", () => {
    const young = state();
    const older = state({ id: "state-2", storyOrder: 50, status: "approved", appearance: { ageYears: 19, hairLength: "mid-back", hairColor: "black" }, assetRefs: ["ref-older"] });
    const proposal = state({ id: "state-3", storyOrder: 70, status: "proposed", appearance: { ageYears: 22 } });
    const alternate = state({ id: "state-4", storyOrder: 90, timelineId: "alternate", appearance: { ageYears: 30 } });
    expect(characterStateAt([young, older, proposal, alternate], "u1", "c1", "main", 40)?.id).toBe("state-1");
    expect(characterStateAt([young, older, proposal, alternate], "u1", "c1", "main", 80)?.id).toBe("state-2");
    expect(characterStateAt([young, older, proposal, alternate], "u1", "c1", "main", 20)?.id).toBe("state-1");
    expect(characterStateAt([young, older, proposal, alternate], "u1", "c1", "missing", 100)).toBeUndefined();
  });

  it("fails closed when multiple approved states conflict at the same story point", () => {
    const conflicting = state({ id: "state-conflict", storyOrder: 10, appearance: { ageYears: 35, hairLength: "floor" } });
    expect(() => characterStateAt([state(), conflicting], "u1", "c1", "main", 10))
      .toThrow(/Ambiguous approved character canon/);
  });

  it("calculates age only from established dates and handles birthdays", () => {
    expect(ageOnInWorldDate("2010-10-20", "2026-10-19")).toBe(15);
    expect(ageOnInWorldDate("2010-10-20", "2026-10-20")).toBe(16);
    expect(ageOnInWorldDate("2010-10-20", "2009-10-20")).toBeUndefined();
    expect(ageOnInWorldDate(undefined, "2026-10-20")).toBeUndefined();
    expect(ageOnInWorldDate("2010-02-30", "2026-10-20")).toBeUndefined();
  });

  it("reports physical redesign deltas and keeps unknowns visible in the art brief", () => {
    const young = state();
    const older = state({ id: "state-2", storyOrder: 50, appearance: { ageYears: 19, hairLength: "mid-back", hairColor: "black", height: "178 cm" } });
    expect(diffCharacterAppearance(young, older)).toEqual(expect.arrayContaining([
      { field: "ageYears", before: "16", after: "19" },
      { field: "hairLength", before: "short", after: "mid-back" },
      { field: "height", before: "unknown/not recorded", after: "178 cm" },
    ]));
    expect(buildCharacterStateBrief(undefined, 2)).toContain("Do not invent age, body, outfit, hair, scars, or physical changes");
    expect(buildCharacterStateBrief(older, 50)).toContain("Do not apply a later body, age, injury stage, scar, outfit or character state");
  });

  it("carries forward known appearance fields and structured injuries until a later state explicitly changes them", () => {
    const first = state({
      appearance: {
        ageYears: 30, hairColor: "black", height: "180 cm", outfitDescription: "torn dark jacket",
        bodyIdentity: { bodyInstanceId: "body-first", incarnationKind: "original", identityContinuity: "same-person" },
        physicalConditions: [
          armFracture(),
          { id: "nose-bruise", kind: "bruise", label: "Bruised nose", bodyRegion: "nose", stage: "fresh",
            severity: 2, firstSeenStoryOrder: 10, healingProgressPercent: 0, painLevel: 5,
            visibleDescription: "red-purple swelling across the bridge of the nose", permanentMark: false },
        ],
      },
    });
    const reborn = state({
      id: "state-reborn", storyOrder: 20,
      appearance: {
        ageYears: 15,
        bodyIdentity: {
          bodyInstanceId: "body-reborn", incarnationKind: "reincarnation", identityContinuity: "same-person",
          memoryContinuity: "full", previousBodyInstanceId: "body-first", ageAtIncarnation: 15,
        },
        physicalConditions: [
          armFracture({ stage: "healing", healingProgressPercent: 35, painLevel: 5,
            visibleDescription: "bruising has darkened; a rigid splint supports the arm" }),
          { id: "nose-bruise", kind: "bruise", label: "Bruised nose", bodyRegion: "nose", stage: "healing",
            severity: 2, firstSeenStoryOrder: 10, healingProgressPercent: 35, painLevel: 2,
            visibleDescription: "fading yellow-purple bruise with mild swelling", permanentMark: false },
        ],
      },
    });
    const healing = state({
      id: "state-healing", storyOrder: 30,
      appearance: {
        hairStyle: "slightly messy fringe",
        physicalConditions: [
          armFracture({ stage: "healing", healingProgressPercent: 75, painLevel: 2,
            visibleDescription: "swelling mostly gone; arm still supported and bruising is faint" }),
          { id: "nose-bruise", kind: "bruise", label: "Bruised nose", bodyRegion: "nose", stage: "healed",
            severity: 2, firstSeenStoryOrder: 10, healingProgressPercent: 100, painLevel: 0,
            visibleDescription: "no visible bruising or swelling remains", permanentMark: false },
        ],
      },
    });
    const laterWithoutRestatingInjury = state({ id: "state-later", storyOrder: 40, appearance: { outfitDescription: "clean school uniform" } });

    const at25 = characterStateAt([first, reborn, healing, laterWithoutRestatingInjury], "u1", "c1", "main", 25)!;
    expect(at25.appearance.ageYears).toBe(15);
    expect(at25.appearance.height).toBe("180 cm");
    expect(at25.appearance.bodyIdentity).toMatchObject({
      bodyInstanceId: "body-reborn", incarnationKind: "reincarnation", previousBodyInstanceId: "body-first",
    });
    expect(at25.appearance.physicalConditions?.find(item => item.id === "nose-bruise")).toMatchObject({
      stage: "healing", healingProgressPercent: 35,
    });

    const at50 = characterStateAt([first, reborn, healing, laterWithoutRestatingInjury], "u1", "c1", "main", 50)!;
    expect(at50.appearance.outfitDescription).toBe("clean school uniform");
    expect(at50.appearance.physicalConditions?.find(item => item.id === "nose-bruise")).toMatchObject({
      stage: "healed", healingProgressPercent: 100,
      visibleDescription: "no visible bruising or swelling remains",
    });
    expect(at50.appearance.physicalConditions?.find(item => item.id === "left-arm-fracture")?.healingProgressPercent).toBe(75);
    expect(buildCharacterStateBrief(at50, 50)).toContain("Body instance: body-reborn");
    expect(buildCharacterStateBrief(at50, 50)).toContain("stage: healed");
  });

  it("uses explicit unknowns to clear previously known details without silently inheriting them", () => {
    const base = state({ appearance: { ageYears: 16, hairColor: "black", height: "170 cm" } });
    const unresolved = state({ id: "state-unknown", storyOrder: 20, appearance: { unknownFields: ["height", "hairColor"] } });
    const resolved = characterStateAt([base, unresolved], "u1", "c1", "main", 20)!;
    expect(resolved.appearance.height).toBeUndefined();
    expect(resolved.appearance.hairColor).toBeUndefined();
    expect(resolved.appearance.unknownFields).toEqual(expect.arrayContaining(["height", "hairColor"]));
    expect(buildCharacterStateBrief(resolved, 20)).toContain("explicitly unknown");
  });

  it("hides preloaded future characters behind a hard reveal gate", () => {
    const preloaded = state({
      storyOrder: 5,
      revealAtStoryOrder: 40,
      appearance: { ageYears: 28, hairColor: "silver", visualNotes: ["antagonist design prepared in advance"] },
    });
    expect(characterRevealStatusAt([preloaded], "u1", "c1", "main", 39)).toBe("hidden");
    expect(characterStateAt([preloaded], "u1", "c1", "main", 39)).toBeUndefined();
    expect(characterRevealStatusAt([preloaded], "u1", "c1", "main", 40)).toBe("available");
    expect(characterStateAt([preloaded], "u1", "c1", "main", 40)?.appearance.hairColor).toBe("silver");
  });

  it("rejects contradictory reveal gates and invalid condition lifecycle data", () => {
    const firstGate = state({ revealAtStoryOrder: 40 });
    const conflictingGate = state({ id: "state-gate-conflict", storyOrder: 20, revealAtStoryOrder: 50 });
    expect(() => characterStateAt([firstGate, conflictingGate], "u1", "c1", "main", 50)).toThrow(/Conflicting approved reveal gates/);
    const invalid = state({ appearance: { physicalConditions: [armFracture({ stage: "healed", healingProgressPercent: 65 })] } });
    expect(validateCharacterEvolutionState(invalid)).toContain("A healed condition must have 100% healing progress when progress is specified.");
  });
});
