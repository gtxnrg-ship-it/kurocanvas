import { describe, expect, it } from "vitest";
import { parseStoryChapterNumber } from "./storyCoordinates";

describe("natural-language story coordinates", () => {
  it.each([
    ["What happened in chapter 2?", 2],
    ["Can you revisit Ch. #003, please?", 3],
    ["I want chapter two again.", 2],
    ["Write Chapter twenty-one.", 21],
    ["Recap chapter one hundred and two.", 102],
    ["Look at Chapter one thousand.", 1000],
    ["For the finale in chapter one hundred thousand, preserve the red scarf.", 100000],
    ["I loved the first chapter.", 1],
    ["The chapter 18th visual is from a flashback.", 18],
  ])("parses explicit chapter references: %s", (input, expected) => {
    expect(parseStoryChapterNumber(input)).toBe(expected);
  });

  it.each([
    "This is the second time Ren wins.",
    "The 18-year-old character remembers his past.",
    "What happened in the final chapter?",
    "Use the number 12 in the artwork.",
  ])("does not invent a chapter coordinate from unrelated text: %s", input => {
    expect(parseStoryChapterNumber(input)).toBeUndefined();
  });
});
