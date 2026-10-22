import { describe, expect, it } from "vitest";
import { shouldStartLiveCreationFromChat } from "./liveCreationIntent";

describe("chat-to-live-creation intent", () => {
  it("routes clear canvas requests into Live Creation", () => {
    expect(shouldStartLiveCreationFromChat("Okay, create this character in the canvas now.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Sketch the city layout on the live canvas.")).toBe(true);
  });

  it("routes explicit visual deliverables even when the user omits the word canvas", () => {
    expect(shouldStartLiveCreationFromChat("Make me a character sheet for the protagonist.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Please draw a portrait of Kuro.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Build a world map for this fantasy setting.")).toBe(true);
  });

  it("keeps ordinary brainstorming and research in chat", () => {
    expect(shouldStartLiveCreationFromChat("Let's discuss the protagonist's character design.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Research visual references for a character sheet.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Create a character with a complicated past.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Write chapter one with a cinematic manga-panel feel.")).toBe(false);
  });

  it("does not activate on an empty request", () => {
    expect(shouldStartLiveCreationFromChat("  ")).toBe(false);
  });
});
