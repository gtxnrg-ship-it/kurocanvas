import { describe, expect, it } from "vitest";
import { conversationTranscriptFilename, formatConversationTranscript } from "./conversationExport";

describe("conversation text export", () => {
  it("exports user and Kuro turns in readable chronological form", () => {
    expect(formatConversationTranscript("My manga", [
      { role: "user", text: "Draw a rainy street." },
      { role: "kuro", text: "I can prepare an editable plan.", tool: "native drawing plan" },
    ])).toBe("My manga\n========\n\nYou\nDraw a rainy street.\n\nKuro\nI can prepare an editable plan.\n[Activity: native drawing plan]\n");
  });

  it("provides a helpful title for empty conversations", () => {
    expect(formatConversationTranscript("Draft", [])).toContain("(This conversation has no messages yet.)");
    expect(formatConversationTranscript("  ", [])).toMatch(/^Untitled conversation/);
  });

  it("creates safe predictable filenames without losing Unicode names", () => {
    expect(conversationTranscriptFilename("My manga / Arc 1")).toBe("My-manga-Arc-1-transcript.txt");
    expect(conversationTranscriptFilename("東京の物語")).toBe("東京の物語-transcript.txt");
    expect(conversationTranscriptFilename("😈😈")).toBe("kuro-conversation-transcript.txt");
    expect(conversationTranscriptFilename("x".repeat(200))).toBe("x".repeat(80) + "-transcript.txt");
  });
});
