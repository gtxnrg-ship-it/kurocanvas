import { describe, expect, it } from "vitest";
import { shouldStartLiveCreationFromChat } from "./liveCreationIntent";

describe("chat-to-live-creation intent", () => {
  it("opens Live Creation for explicit chapter-production commands, not casual chapter discussion", () => {
    expect(shouldStartLiveCreationFromChat("Let's write the first chapter.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Let's write chapter one as a manga storyboard.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Please outline the next chapter.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Let's discuss what happens in chapter one.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Don't start the first chapter yet; let's finish the worldbuilding.")).toBe(false);
  });

  it("routes clear canvas requests into Live Creation", () => {
    expect(shouldStartLiveCreationFromChat("Okay, create this character in the canvas now.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Sketch the city layout on the live canvas.")).toBe(true);
  });

  it("routes explicit visual deliverables even when the user omits the word canvas", () => {
    expect(shouldStartLiveCreationFromChat("Make me a character sheet for the protagonist.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Please draw a portrait of Kuro.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Build a world map for this fantasy setting.")).toBe(true);
  });

  it("understands natural visual requests without requiring the word canvas", () => {
    expect(shouldStartLiveCreationFromChat("Let's make the main character's overall look now.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Start creating the characters' appearances.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Design a visual reference sheet for our villain.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Sketch the protagonist from head to toe.")).toBe(true);
  });

  it("routes direct drawing commands while respecting explicit negative intent", () => {
    expect(shouldStartLiveCreationFromChat("Draw her.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Sketch the character.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Don't draw her yet; let's keep brainstorming.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("No need to create a character sheet yet.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Don't change her outfit yet; let's keep discussing it.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("I don't want you to draw her yet.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Don't change her outfit, just make her hair shorter.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Don't draw her yet, but show me her current outfit.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Don't change her outfit, but let's discuss her hair.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Let's discuss how her scar affects her confidence.")).toBe(false);
  });

  it("routes natural appearance edits directly into visual creation", () => {
    expect(shouldStartLiveCreationFromChat("Make her look older and give her a scar over the left eye.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Change his outfit to a long black coat.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Add glasses to the protagonist and shorten her hair.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Show me what she looks like now.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Make her personality more confident.")).toBe(false);
  });

  it("keeps narrative-only appearance references in chat unless drawing is explicitly requested", () => {
    expect(shouldStartLiveCreationFromChat("Add a scar to her backstory.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Include her old injury in the character history.")).toBe(false);
    expect(shouldStartLiveCreationFromChat("Add a scar to her appearance and draw it on the canvas.")).toBe(true);
    expect(shouldStartLiveCreationFromChat("Make her hair shorter and explain how it fits the story.")).toBe(true);
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
