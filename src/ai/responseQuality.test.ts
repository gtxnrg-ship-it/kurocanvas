import { describe, expect, it } from "vitest";
import { getKuroResponseQualityGuidance, getKuroResponseTokenBudget, inferKuroResponseDepth } from "./responseQuality";

describe("Kuro request-aware response quality", () => {
  it("does not expand greetings and explicit brevity requests into essays", () => {
    expect(inferKuroResponseDepth("hey")).toBe("quick");
    expect(inferKuroResponseDepth("Quick answer, please.")).toBe("quick");
    expect(getKuroResponseTokenBudget("Just the answer, no explanation.")).toBe(900);
  });

  it("uses substantial depth for creative, technical, and explanatory requests", () => {
    expect(inferKuroResponseDepth("Explain how this universe could play out, with different possibilities.")).toBe("deep");
    expect(inferKuroResponseDepth("Please review this implementation and explain the architecture.")).toBe("deep");
    expect(getKuroResponseTokenBudget("Write a detailed chapter with foreshadowing and continuity.")).toBe(3800);
  });

  it("prioritizes comprehensive requests over generic brevity words", () => {
    expect(inferKuroResponseDepth("Give me a comprehensive end-to-end review, leave nothing out.")).toBe("exhaustive");
    expect(getKuroResponseTokenBudget("Fully finish the entire system, all edge cases included.")).toBe(6000);
  });

  it("bounds the experimental local model's requested output budget", () => {
    expect(getKuroResponseTokenBudget("Write an exhaustive story bible.", "kuro-local-browser")).toBe(1200);
    expect(getKuroResponseTokenBudget("Hello", "kuro-local-browser")).toBe(700);
  });

  it("encourages readable Markdown without over-formatting simple replies", () => {
    const guidance = getKuroResponseQualityGuidance("Write a detailed design review.");
    expect(guidance).toMatch(/readable Markdown/i);
    expect(guidance).toMatch(/descriptive headings/i);
    expect(guidance).toMatch(/fenced code blocks/i);
    expect(guidance).toMatch(/avoid a heading on every paragraph/i);
    expect(guidance).toMatch(/Do not emit raw HTML/i);
  });

  it("asks Kuro to understand imperfect English and distinguish author intent from reader-facing reveals", () => {
    const guidance = getKuroResponseQualityGuidance("Write a story with an Easter egg cameo.");
    expect(guidance).toMatch(/grammatically imperfect/i);
    expect(guidance).toMatch(/do not bluff/i);
    expect(guidance).toMatch(/author-only planning distinct/i);
    expect(guidance).toMatch(/substantial/i);
  });
});
