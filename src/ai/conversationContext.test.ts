import { describe, expect, it } from "vitest";
import { buildKuroConversationTurns } from "./conversationContext";

describe("buildKuroConversationTurns", () => {
  it("maps user and Kuro turns to model roles in their original order", () => {
    expect(buildKuroConversationTurns([
      { role: "user", text: "Let's make a hero." },
      { role: "kuro", text: "Hmph. What kind?" },
      { role: "user", text: "A reluctant one." },
    ])).toEqual([
      { role: "user", content: "Let's make a hero." },
      { role: "assistant", content: "Hmph. What kind?" },
      { role: "user", content: "A reluctant one." },
    ]);
  });

  it("bounds prompt history without modifying source messages", () => {
    const source = [
      { role: "user" as const, text: "old" },
      { role: "kuro" as const, text: "reply" },
      { role: "user" as const, text: "x".repeat(30) },
    ];
    const turns = buildKuroConversationTurns(source, 2, 10);
    expect(turns).toHaveLength(2);
    expect(turns[1].content).toBe("xxxxxxxxxx …[earlier turn clipped for context]");
    expect(source[2].text).toHaveLength(30);
  });

  it("can recall an older relevant decision while keeping recent turns and chronological order", () => {
    const messages: Array<{ role: "user" | "kuro"; text: string }> = [
      { role: "user", text: "Continuity rule: the stranger wears a red scarf and secretly carries a ceremonial dagger. This is a future cameo clue." },
      ...Array.from({ length: 18 }, (_, index) => ({
        role: (index % 2 === 0 ? "kuro" : "user") as "user" | "kuro",
        text: index % 2 === 0 ? "Let's keep building the academy and its atmosphere." : "The hallway and courtyard should feel lived in.",
      })),
      { role: "user", text: "Now write the hallway scene and preserve the hidden clue." },
    ];
    const turns = buildKuroConversationTurns(messages, 8, 200, "red scarf ceremonial dagger hidden clue", 1200);
    expect(turns.length).toBeLessThanOrEqual(8);
    expect(turns.some(turn => String(turn.content).includes("red scarf"))).toBe(true);
    expect(turns[turns.length - 1].content).toContain("hallway scene");
    const userMessages = turns.filter(turn => turn.role === "user").map(turn => turn.content);
    expect(userMessages[userMessages.length - 1]).toContain("hallway scene");
  });

  it("respects the total prompt budget and leaves durable source text unchanged", () => {
    const source = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 ? "user" as const : "kuro" as const,
      text: (index === 0 ? "Important lore: the blue lantern means the captain has returned. " : "") + "story detail ".repeat(40),
    }));
    const originalLength = source.reduce((sum, item) => sum + item.text.length, 0);
    const turns = buildKuroConversationTurns(source, 24, 600, "blue lantern captain returned", 4000);
    expect(turns.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(4000);
    expect(turns.some(item => String(item.content).includes("blue lantern"))).toBe(true);
    expect(source.reduce((sum, item) => sum + item.text.length, 0)).toBe(originalLength);
  });

  it("handles empty, blank, and invalid limits safely", () => {
    expect(buildKuroConversationTurns([])).toEqual([]);
    expect(buildKuroConversationTurns([{ role: "user", text: "  " }])).toEqual([]);
    expect(buildKuroConversationTurns([{ role: "user", text: "ok" }], -1)).toEqual([]);
  });
});
