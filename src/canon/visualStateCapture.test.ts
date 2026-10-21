import { describe, expect, it } from "vitest";
import { proposeVisualStatesFromEvidence, type VisualStateCandidate } from "./visualStateCapture";
import type { CharacterVisualState } from "./styleBible";

const userMessage = "Chapter 12: Ren is now 18, has short black hair, and a thin scar above his left eyebrow.";
const candidate: VisualStateCandidate = {
  characterName: "Ren",
  evidence: userMessage,
  chapterNumber: 12,
  storyOrder: 999,
  age: "18",
  hair: "short black hair",
  scars: "thin scar above his left eyebrow",
};

describe("evidence-backed character visual capture", () => {
  it("creates only proposed states and anchors every field to an exact user quote", () => {
    const states = proposeVisualStatesFromEvidence([candidate], userMessage, [], () => "state-1");
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      id: "state-1",
      characterName: "Ren",
      chapterNumber: 12,
      storyOrder: 12,
      chapterLabel: "Chapter 12",
      age: "18",
      hair: "short black hair",
      scars: "thin scar above his left eyebrow",
      sourceEvidence: userMessage,
      status: "proposed",
    });
  });

  it("rejects a fabricated quote, a missing chapter, and fields not present in evidence", () => {
    const invalid = [
      { ...candidate, evidence: "Chapter 12: Ren has blue hair." },
      { ...candidate, evidence: "Ren is 18 and has short black hair.", chapterNumber: 12 },
      { ...candidate, scars: "a dragon tattoo" },
    ];
    expect(proposeVisualStatesFromEvidence(invalid, userMessage, [], () => "id")).toEqual([]);
  });

  it("requires a character name to be explicitly present in the quote", () => {
    expect(proposeVisualStatesFromEvidence([{ ...candidate, characterName: "Mira" }], userMessage, [], () => "id")).toEqual([]);
  });

  it("deduplicates repeated exact evidence for the same chapter and character", () => {
    const existing: CharacterVisualState[] = [{ ...candidate, id: "saved", storyOrder: 12, chapterLabel: "Chapter 12", sourceEvidence: userMessage, status: "proposed" } as CharacterVisualState];
    expect(proposeVisualStatesFromEvidence([candidate], userMessage, existing, () => "id")).toEqual([]);
  });

  it("does not infer a character look when there are no quoted visual attributes", () => {
    const text = "Chapter 3: Ren arrives at the station.";
    expect(proposeVisualStatesFromEvidence([{ characterName: "Ren", evidence: text, chapterNumber: 3 }], text, [], () => "id")).toEqual([]);
  });
});
