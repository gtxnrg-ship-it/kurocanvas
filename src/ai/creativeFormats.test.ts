import { describe, expect, it } from "vitest";
import { DEFAULT_ILLUSTRATED_STORY, detectCreativeProductionRequest, getCreativeFormatSpec, describeCreativeFormats } from "./creativeFormats";

describe("creative format routing", () => {
  it("recognizes the requested comic and visual-story forms with format-appropriate canvases", () => {
    expect(detectCreativeProductionRequest("Let's create a Webtoon about a haunted train.")).toMatchObject({
      id: "webtoon", layout: "vertical-strip", width: 900, height: 6000,
    });
    expect(detectCreativeProductionRequest("Write a doujin one-shot about two original rivals.")).toMatchObject({
      id: "doujin", layout: "page", width: 1800, height: 2700,
    });
    expect(detectCreativeProductionRequest("Make me a 4-panel comic strip.")).toMatchObject({
      id: "comic-strip", layout: "horizontal-strip", width: 2400, height: 1200,
    });
    expect(detectCreativeProductionRequest("Storyboard a visual novel scene with two characters.")).toMatchObject({
      id: "visual-novel", layout: "wide-scene", width: 1600, height: 900,
    });
    expect(detectCreativeProductionRequest("Create a graphic novel page.")).toMatchObject({
      id: "graphic-novel", layout: "page", width: 1800, height: 2700,
    });
    expect(detectCreativeProductionRequest("Make an illustrated picture book spread.")).toMatchObject({
      id: "picture-book", layout: "square-spread", width: 1800, height: 1800,
    });
  });

  it("keeps brainstorming, research, and deferred production in chat", () => {
    expect(detectCreativeProductionRequest("Let's brainstorm ideas for a Webtoon.")).toBeUndefined();
    expect(detectCreativeProductionRequest("Research doujin history and conventions.")).toBeUndefined();
    expect(detectCreativeProductionRequest("Show me references for a manga page.")).toBeUndefined();
    expect(detectCreativeProductionRequest("Don't start the one-shot yet; let's finish the cast.")).toBeUndefined();
  });

  it("uses a format-neutral default for chapters when no tradition was specified", () => {
    expect(DEFAULT_ILLUSTRATED_STORY).toMatchObject({
      id: "illustrated-story", label: "Flexible illustrated story", width: 900, height: 6000,
    });
    expect(DEFAULT_ILLUSTRATED_STORY.promptGuidance).not.toContain("manga panel");
  });

  it("exposes the available formats and keeps prompts faithful to each medium", () => {
    expect(describeCreativeFormats()).toContain("Doujin");
    expect(getCreativeFormatSpec("visual-novel").promptGuidance).toContain("not a playable game");
    expect(getCreativeFormatSpec("comic-strip").promptGuidance).toContain("horizontal strip");
  });
});
