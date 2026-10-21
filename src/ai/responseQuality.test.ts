import { describe, expect, it } from "vitest";
import { formatKuroChatResponse, isKuroChatResponseTruncated, getKuroResponseQualityGuidance, getKuroResponseTokenBudget, inferKuroResponseDepth } from "./responseQuality";

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

  it("gives continuation turns a deep budget unless the creator explicitly requests brevity", () => {
    expect(inferKuroResponseDepth("continue")).toBe("deep");
    expect(getKuroResponseTokenBudget("continue", "kuro-local-browser")).toBe(1024);
    expect(inferKuroResponseDepth("continue that in one sentence")).toBe("quick");
    expect(getKuroResponseTokenBudget("continue that in one sentence", "kuro-local-browser")).toBe(256);
  });

  it("prioritizes comprehensive requests over generic brevity words", () => {
    expect(inferKuroResponseDepth("Give me a comprehensive end-to-end review, leave nothing out.")).toBe("exhaustive");
    expect(getKuroResponseTokenBudget("Fully finish the entire system, all edge cases included.")).toBe(6000);
  });

  it("bounds the experimental local model's requested output budget", () => {
    expect(getKuroResponseTokenBudget("Write an exhaustive story bible.", "kuro-local-browser")).toBe(1024);
    expect(getKuroResponseTokenBudget("Hello", "kuro-local-browser")).toBe(256);
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


describe("truthful model finish reporting", () => {
  it("does not alter a normally completed answer", () => {
    expect(formatKuroChatResponse("  Hello, creator.  ", "stop")).toBe("Hello, creator.");
  });

  it("tells the creator when the local output ceiling truncated a reply", () => {
    const response = formatKuroChatResponse("Here is the chapter outline…", "length");
    expect(response).toContain("Here is the chapter outline");
    expect(response).toContain("Qwen3-0.6B's current output limit");
    expect(response).toContain("Say “continue”");
  });

  it("does not present empty output as successful content", () => {
    expect(formatKuroChatResponse("  ", "stop")).toBe("The model returned an empty response. Please try again.");
  });

  it("flags a partial response ending with a runtime error", () => {
    expect(formatKuroChatResponse("Partial answer", "error")).toContain("may be incomplete");
  });
});


describe("conversation continuation harness", () => {
  it("tells Kuro to continue from the last unfinished point rather than restart", () => {
    const guidance = getKuroResponseQualityGuidance("continue");
    expect(guidance).toContain("CONTINUATION REQUEST");
    expect(guidance).toMatch(/immediately preceding assistant answer/i);
    expect(guidance).toMatch(/do not restart the topic/i);
    expect(guidance).toMatch(/last unfinished point/i);
  });

  it("recognizes natural continuation phrasing without changing normal guidance", () => {
    expect(getKuroResponseQualityGuidance("go on with the explanation")).toContain("CONTINUATION REQUEST");
    expect(getKuroResponseQualityGuidance("finish that")).toContain("CONTINUATION REQUEST");
    expect(getKuroResponseQualityGuidance("Explain how a world economy could work.")).not.toContain("CONTINUATION REQUEST");
  });
});


describe("truncated reply continuation affordance", () => {
  it("shows continuation only when the output-limit notice exists", () => {
    expect(isKuroChatResponseTruncated("A normal answer.")).toBe(false);
    expect(isKuroChatResponseTruncated(formatKuroChatResponse("Partial answer", "length"))).toBe(true);
  });
});
