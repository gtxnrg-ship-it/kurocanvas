import { describe, expect, it } from "vitest";
import { extractCreativeInfluenceResearch } from "./inspirationResearch";

describe("creative influence research intent", () => {
  it("recognizes multiple named works and distinct creative aspects in one natural-language request", () => {
    const results = extractCreativeInfluenceResearch(
      "How about we borrow this from Horimiya, then borrow this gang and leadership thing from Tokyo Revengers, and the power system and overall character art style from Bleach?"
    );
    expect(results).toHaveLength(3);
    expect(results.map(result => result.work)).toEqual(["Horimiya", "Tokyo Revengers", "Bleach"]);
    expect(results[0].aspect).toContain("character dynamics");
    expect(results[1].aspect).toMatch(/gang and leadership/i);
    expect(results[2].aspect).toMatch(/power system and overall character art style/i);
    expect(results.every(result => result.query === result.work)).toBe(true);
  });

  it("supports quoted titles and titles containing connector words", () => {
    const results = extractCreativeInfluenceResearch(
      'Use the visual style from "The Apothecary Diaries" and draw inspiration from Lord of the Rings for worldbuilding.'
    );
    expect(results.map(result => result.work)).toEqual(["The Apothecary Diaries", "Lord of the Rings"]);
  });

  it("deduplicates repeated source works case-insensitively", () => {
    const results = extractCreativeInfluenceResearch(
      "Borrow character dynamics from Horimiya and the visual style from horimiya."
    );
    expect(results).toHaveLength(1);
  });

  it("does not enqueue research for ordinary opinions or explicitly rejected inspiration", () => {
    expect(extractCreativeInfluenceResearch("I like the leadership in Tokyo Revengers.")).toEqual([]);
    expect(extractCreativeInfluenceResearch("Don't borrow the power system from Naruto.")).toEqual([]);
    expect(extractCreativeInfluenceResearch("I want an original manga, not something based on an existing series.")).toEqual([]);
  });

  it("ignores messages without a named work after a source preposition", () => {
    expect(extractCreativeInfluenceResearch("Borrow some relationship comedy and visual style for my manga.")).toEqual([]);
  });
});
