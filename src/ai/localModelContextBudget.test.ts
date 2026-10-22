import { describe, expect, it } from "vitest";
import { boundMessages } from "./localTinyModelProvider";

describe("local model context budget", () => {
  it("keeps the newest user request when a long system prompt would otherwise consume the whole budget", () => {
    const messages = [
      { role: "system", content: "SYSTEM-BEGIN " + "persona and rules ".repeat(450) + " SYSTEM-MIDDLE-MARKER " + "persona and rules ".repeat(450) + " SYSTEM-TAIL-MARKER" },
      { role: "assistant", content: "Older useful context " + "world detail ".repeat(100) },
      { role: "user", content: "CURRENT USER REQUEST: continue chapter 14. " + "required detail ".repeat(200) + " FINAL-REQUEST-MARKER" },
    ];
    const bounded = boundMessages(messages, 1_200);
    expect(bounded.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(1_200);
    expect(bounded[0].role).toBe("system");
    expect(bounded[0].content).toContain("SYSTEM-BEGIN");
    expect(bounded[0].content).toContain("SYSTEM-MIDDLE-MARKER");
    expect(bounded[0].content).toContain("SYSTEM-TAIL-MARKER");
    expect(bounded[bounded.length - 1].role).toBe("user");
    expect(bounded[bounded.length - 1].content).toContain("CURRENT USER REQUEST");
    expect(bounded[bounded.length - 1].content).toContain("FINAL-REQUEST-MARKER");
  });

  it("prioritizes project-context sections that match the active request", () => {
    const system = [
      "KURO CORE CONTRACT: Keep the creator's actual request and approved facts intact.",
      "UNRELATED SETTING NOTES: " + "ancient harbor details and distant provinces. ".repeat(18),
      "UNRELATED HISTORICAL NOTES: " + "old treaties, ships, and weather patterns. ".repeat(18),
      "APPROVED CHARACTER CONTINUITY: Aiko wears the crimson scarf in this chapter; preserve the crimson scarf continuity anchor across the page.",
      "UNRELATED EQUIPMENT NOTES: " + "spare tools, metal parts, and workshop inventory. ".repeat(18),
    ].join("\n\n");
    const bounded = boundMessages([
      { role: "system", content: system },
      { role: "assistant", content: "Earlier unrelated discussion." },
      { role: "user", content: "For Aiko, preserve the crimson scarf continuity anchor." },
    ], 1_800);

    expect(bounded.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(1_800);
    expect(bounded[0]?.content).toContain("KURO CORE CONTRACT");
    expect(bounded[0]?.content).toContain("Aiko wears the crimson scarf");
    expect(bounded[bounded.length - 1]?.content).toContain("crimson scarf continuity anchor");
  });

  it("gives a single-turn request the unused space when there is no transcript to preserve", () => {
    const prompt = "Current task: create a character sheet. " + "keep the character's silhouette consistent. ".repeat(100);
    const bounded = boundMessages([
      { role: "system", content: "You are Kuro. Preserve creative intent." },
      { role: "user", content: prompt },
    ], 900);
    expect(bounded).toHaveLength(2);
    expect(bounded[1].content.length).toBeGreaterThan(400);
    expect(bounded[1].content).toContain("Current task:");
    expect(bounded.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(900);
  });

  it("keeps the newest user turn last and preserves earlier history where budget remains", () => {
    const bounded = boundMessages([
      { role: "system", content: "System rules." },
      { role: "user", content: "Earlier user request." },
      { role: "assistant", content: "Earlier answer." },
      { role: "user", content: "The active request must remain last." },
    ], 1_000);
    expect(bounded.map(message => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(bounded[bounded.length - 1]?.content).toBe("The active request must remain last.");
  });

  it("handles tiny budgets without exceeding the requested limit", () => {
    for (const budget of [1, 8, 20, 64]) {
      const bounded = boundMessages([
        { role: "system", content: "Long system rule ".repeat(20) },
        { role: "assistant", content: "Older exchange ".repeat(20) },
        { role: "user", content: "Keep the active request." },
      ], budget);
      expect(bounded.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(budget);
      expect(bounded[bounded.length - 1]?.role).toBe("user");
    }
  });
});
