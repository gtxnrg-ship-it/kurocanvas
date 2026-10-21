import { describe, expect, it } from "vitest";
import { getKuroVoiceGuidance, KURO_PERSONA_CORE } from "./kuroPersona";

describe("Kuro personality contract", () => {
  it("defines a recognizable but context-sensitive tsundere voice", () => {
    expect(KURO_PERSONA_CORE).toContain("lightly tsundere");
    expect(KURO_PERSONA_CORE).toContain("natural");
    expect(KURO_PERSONA_CORE).toContain("stop teasing");
    expect(KURO_PERSONA_CORE).toContain("Teasing stays affectionate");
  });

  it("keeps personality subordinate to factual grounding and execution safety", () => {
    expect(KURO_PERSONA_CORE).toMatch(/never invent/i);
    expect(KURO_PERSONA_CORE).toContain("Never claim");
    expect(KURO_PERSONA_CORE).toContain("user consent");
    expect(KURO_PERSONA_CORE).toContain("approved canon");
  });

  it("keeps creative exploration nonjudgmental, including mature fictional genres", () => {
    expect(KURO_PERSONA_CORE).toMatch(/do not shame, mock, moralize/i);
    expect(KURO_PERSONA_CORE).toMatch(/mature fiction/i);
    expect(KURO_PERSONA_CORE).toMatch(/Critique the craft, not the creator/i);
    expect(KURO_PERSONA_CORE).toMatch(/storage\/provider path/i);
    expect(KURO_PERSONA_CORE).toMatch(/Do not claim every model supports every request/i);
  });

  it("expects deep understanding, substantial answers, and tolerant interpretation of imperfect English", () => {
    expect(KURO_PERSONA_CORE).toMatch(/Treat imperfect English, fragments, slang/i);
    expect(KURO_PERSONA_CORE).toMatch(/real depth/i);
    expect(KURO_PERSONA_CORE).toMatch(/Do not make the user repeat information/i);
    expect(KURO_PERSONA_CORE).toMatch(/A complex world, chapter, design, research task, or architectural problem deserves an expansive/i);
  });

  it("supports author-directed Easter eggs without leaking their payoff to readers", () => {
    expect(KURO_PERSONA_CORE).toMatch(/intentional Easter egg/i);
    expect(KURO_PERSONA_CORE).toMatch(/author-facing planning separate from reader-facing presentation/i);
    expect(KURO_PERSONA_CORE).toMatch(/Do not invent a hidden connection/i);
  });

  it("supports all voice intensity settings without changing canon or permissions", () => {
    expect(getKuroVoiceGuidance("subtle")).toMatch(/subtle/i);
    expect(getKuroVoiceGuidance("playful")).toMatch(/balanced/i);
    expect(getKuroVoiceGuidance("expressive")).toMatch(/expressive/i);
  });
});
