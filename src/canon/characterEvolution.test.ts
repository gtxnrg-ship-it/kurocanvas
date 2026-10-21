import { describe, expect, it } from "vitest";
import {
  ageOnInWorldDate,
  buildCharacterStateBrief,
  characterStateAt,
  diffCharacterAppearance,
  validateCharacterEvolutionState,
  type CharacterEvolutionState,
} from "./characterEvolution";

const state = (overrides: Partial<CharacterEvolutionState> = {}): CharacterEvolutionState => ({
  id: "state-1", universeId: "u1", characterId: "c1", timelineId: "main", storyOrder: 10,
  status: "approved", appearance: { ageYears: 16, hairLength: "short", hairColor: "black" },
  relationshipStateRefs: [], assetRefs: ["ref-young"], sourceMessageIds: ["msg-1"],
  changeSummary: "Initial school-age design", createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
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
    expect(buildCharacterStateBrief(undefined, 2)).toContain("Do not invent age, outfit, hair, scars, or physical changes");
    expect(buildCharacterStateBrief(older, 50)).toContain("Do not apply a later character state to a flashback");
  });
});
