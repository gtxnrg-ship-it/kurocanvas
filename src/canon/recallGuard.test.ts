import { describe, expect, it } from "vitest";
import { missingChapterRecallMessage } from "./recallGuard";

describe("chapter recall hallucination guard", () => {
  it("blocks factual chapter recall when no approved matching memory exists", () => {
    const message = missingChapterRecallMessage("What happened in chapter 12? Bring back the exact panel.", false);
    expect(message).toContain("Chapter 12");
    expect(message).toContain("I won't invent");
  });

  it("allows recall when matching approved memory exists", () => {
    expect(missingChapterRecallMessage("Recap chapter 12", true)).toBeUndefined();
  });

  it("does not block creative requests to write a new scene", () => {
    expect(missingChapterRecallMessage("Write a new flashback scene for chapter 12 where Ren meets Mira.", false)).toBeUndefined();
  });

  it("does not block general chapter discussion without factual recall intent", () => {
    expect(missingChapterRecallMessage("Let's plan the art style for chapter 12.", false)).toBeUndefined();
  });
});
