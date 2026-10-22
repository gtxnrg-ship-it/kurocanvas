import { describe, expect, it } from "vitest";
import { isCanvasVisualIntent, isDrawingIntent, shouldAttachCanvasPreview } from "./visualIntent";

describe("canvas visual intent", () => {
  it.each([
    "Draw a rainy street scene",
    "Sketch the character from the side",
    "Create a composition of the palace",
    "Put a speech bubble on the canvas",
    "After we brainstorm, create the characters and their overall looks",
    "Design my main character's visual design and outfit",
    "Make a character sheet for the protagonist",
  ])("recognizes drawing request: %s", text => {
    expect(isDrawingIntent(text)).toBe(true);
  });

  it.each([
    "Look at the canvas and tell me what's wrong",
    "Give me feedback on this drawing",
    "Describe the canvas",
    "Is this composition working?",
    "Compare this sketch to the earlier version",
  ])("recognizes visual inspection request: %s", text => {
    expect(isCanvasVisualIntent(text)).toBe(true);
    expect(shouldAttachCanvasPreview(text, ["chat", "vision"])).toBe(true);
  });

  it("routes visual character design without misrouting ordinary story brainstorming", () => {
    expect(isDrawingIntent("Let's create a character with a scarred face and a long coat")).toBe(true);
    expect(isDrawingIntent("Create a backstory for my main character")).toBe(false);
    expect(isDrawingIntent("Let's brainstorm how the protagonist changes across the story")).toBe(false);
  });

  it("does not attach canvas previews for ordinary story chat", () => {
    expect(shouldAttachCanvasPreview("Help me brainstorm a villain's backstory", ["chat", "vision"])).toBe(false);
  });

  it("does not attach canvas previews to models without declared vision support", () => {
    expect(shouldAttachCanvasPreview("Look at the canvas", ["chat"])).toBe(false);
    expect(shouldAttachCanvasPreview("Draw a cat", ["chat"])).toBe(false);
  });
});
