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

  it("handles empty, blank, and invalid limits safely", () => {
    expect(buildKuroConversationTurns([])).toEqual([]);
    expect(buildKuroConversationTurns([{ role: "user", text: "  " }])).toEqual([]);
    expect(buildKuroConversationTurns([{ role: "user", text: "ok" }], -1)).toEqual([]);
  });
});
