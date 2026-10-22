import { describe, expect, it } from "vitest";
import { chooseDrawingTarget } from "./drawingTarget";

const drawings = [
  { id: "recent", name: "Recent sketch" },
  { id: "active", name: "Character model" },
];

describe("drawing target selection", () => {
  it("never falls back to an unrelated drawing for a fresh chapter storyboard", () => {
    expect(chooseDrawingTarget(drawings, {
      chapterStoryboardRequest: true,
      requestedDrawingId: "new-chapter-strip",
      activeDrawingId: "active",
    })).toBeUndefined();
  });

  it("reuses only the exact requested chapter drawing when that target already exists", () => {
    expect(chooseDrawingTarget([...drawings, { id: "chapter-1", name: "Chapter 1 strip" }], {
      chapterStoryboardRequest: true,
      requestedDrawingId: "chapter-1",
      activeDrawingId: "active",
    })).toEqual({ id: "chapter-1", name: "Chapter 1 strip" });
  });

  it("prefers the active document for non-chapter visual edits", () => {
    expect(chooseDrawingTarget(drawings, {
      chapterStoryboardRequest: false,
      activeDrawingId: "active",
    })).toEqual({ id: "active", name: "Character model" });
  });

  it("falls back to the newest listed drawing for non-chapter edits without a selected target", () => {
    expect(chooseDrawingTarget(drawings, {
      chapterStoryboardRequest: false,
      activeDrawingId: "missing",
    })).toEqual({ id: "recent", name: "Recent sketch" });
  });
});
