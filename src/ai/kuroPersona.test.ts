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
    expect(KURO_PERSONA_CORE).toContain("never invent");
    expect(KURO_PERSONA_CORE).toContain("Never claim");
    expect(KURO_PERSONA_CORE).toContain("user consent");
    expect(KURO_PERSONA_CORE).toContain("approved canon");
  });

  it("supports all voice intensity settings without changing canon or permissions", () => {
    expect(getKuroVoiceGuidance("subtle")).toMatch(/subtle/i);
    expect(getKuroVoiceGuidance("playful")).toMatch(/balanced/i);
    expect(getKuroVoiceGuidance("expressive")).toMatch(/expressive/i);
  });
});
