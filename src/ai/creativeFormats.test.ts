import { describe, expect, it } from "vitest";
import { DEFAULT_ILLUSTRATED_STORY, detectCreativeProductionRequest, getCreativeFormatSpec, describeCreativeFormats, resolveCreativeFormatChoice } from "./creativeFormats";

describe("creative format routing", () => {
  it("recognizes comic and visual-story forms with format-appropriate canvases", () => {
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

    expect(detectCreativeProductionRequest("Create a zine page about our fictional city.")).toMatchObject({
      id: "zine", layout: "page", width: 1800, height: 2700,
    });
    expect(detectCreativeProductionRequest("Storyboard an animated short about a lost robot.")).toMatchObject({
      id: "storyboard", layout: "page", width: 1800, height: 2700,
    });
    expect(detectCreativeProductionRequest("Create a comic about two rival chefs.")).toMatchObject({
      id: "comic-page", layout: "page", width: 1800, height: 2700,
    });
    expect(detectCreativeProductionRequest("Make an illustrated picture book spread.")).toMatchObject({
      id: "picture-book", layout: "square-spread", width: 1800, height: 1800,
    });
  });

  it("keeps brainstorming, research, and deferrals in chat", () => {
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

  it("keeps custom formats open-ended and does not block production that also uses references", () => {
    expect(detectCreativeProductionRequest("Create a custom hybrid visual story format.")).toMatchObject({
      id: "custom-storyboard", width: 1600, height: 1200,
    });
    expect(detectCreativeProductionRequest("Create a Webtoon using historical references.")).toMatchObject({ id: "webtoon" });
  });

  it("resolves explicit picker choices without forcing a format in Auto", () => {
    expect(resolveCreativeFormatChoice("auto")).toBeUndefined();
    expect(resolveCreativeFormatChoice("webtoon")).toMatchObject({
      id: "webtoon", layout: "vertical-strip", width: 900, height: 6000,
    });
    expect(resolveCreativeFormatChoice("one-shot")).toMatchObject({
      id: "one-shot", label: "Short one-shot", foundationGate: true,
    });
    expect(resolveCreativeFormatChoice("visual-novel")).toMatchObject({
      id: "visual-novel", layout: "wide-scene", width: 1600, height: 900,
    });
  });

  it("exposes available formats and guardrails", () => {
    expect(describeCreativeFormats()).toContain("Doujin");
    expect(getCreativeFormatSpec("visual-novel").promptGuidance).toContain("not a playable game");
    expect(getCreativeFormatSpec("comic-strip").promptGuidance).toContain("horizontal strip");
    expect(getCreativeFormatSpec("custom-storyboard").promptGuidance).toContain("Do not force manga");
  });
});
