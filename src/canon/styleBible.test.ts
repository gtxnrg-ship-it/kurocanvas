import { describe, expect, it } from "vitest";
import { buildStyleBibleContext, createEmptyStyleBible, findStyleConflicts, resolveCharacterVisualState, validateStyleBible, type ProjectStyleBible } from "./styleBible";

function seeded(): ProjectStyleBible {
  const bible = createEmptyStyleBible("project-1");
  bible.title = "Original urban fantasy";
  bible.styleSummary = "Expressive webtoon linework with consistent face construction and restrained palette.";
  bible.inspirations = [
    { id:"inspiration-1", work:"Horimiya English dub", aspect:"relationship-comedy", notes:"Naturalistic teasing, warm romantic timing; write original dialogue.", status:"approved" },
    { id:"inspiration-2", work:"Lookism", aspect:"linework", notes:"Use high-contrast urban-webtoon energy as broad inspiration; define original face shapes.", status:"approved" },
    { id:"inspiration-3", work:"Tokyo Revengers", aspect:"group-dynamics", notes:"Loyalty, faction tension, and ensemble chemistry; build original groups.", status:"proposed" },
  ];
  bible.rules = [{ id:"rule-1", category:"continuity", rule:"Scars persist in all later visual states unless an approved event explains removal.", status:"approved" }];
  bible.characterStates = [
    { id:"state-1", characterName:"Ren", storyOrder:1, chapterLabel:"Chapter 1", age:"17", hair:"short black undercut", scars:"none", status:"approved" },
    { id:"state-2", characterName:"Ren", storyOrder:12, chapterLabel:"Chapter 12", age:"18", hair:"grown-out black undercut", scars:"thin scar across left eyebrow", status:"approved" },
  ];
  return bible;
}

describe("project style bible", () => {
  it("keeps aspect-specific inspirations separate and excludes unapproved sources from prompt context", () => {
    const bible = seeded();
    const context = buildStyleBibleContext(bible, "project-1", "Draw Ren in chapter 12");
    expect(context).toContain("relationship-comedy from Horimiya English dub");
    expect(context).toContain("linework from Lookism");
    expect(context).not.toContain("Tokyo Revengers");
    expect(context).toContain("thin scar across left eyebrow");
    expect(context).toContain("Never drift between chapters");
  });

  it("isolates project context and rejects cross-project use", () => {
    expect(() => buildStyleBibleContext(seeded(), "other-project", "draw")).toThrow(/project/i);
  });

  it("detects conflicting approved visual states at the same story order", () => {
    const bible = seeded();
    bible.characterStates.push({ id:"state-conflict", characterName:"Ren", storyOrder:12, chapterLabel:"Chapter 12", hair:"long blond hair", scars:"thin scar across left eyebrow", status:"approved" });
    expect(findStyleConflicts(bible).some(issue=>issue.code==="same-time-visual-conflict" && issue.severity==="error")).toBe(true);
  });

  it("validates HTTPS reference links and project ownership", () => {
    const bible = seeded();
    bible.inspirations[0].sourceUrl = "http://unsafe.example";
    expect(validateStyleBible(bible, "project-1").some(issue=>issue.includes("HTTPS"))).toBe(true);
    expect(validateStyleBible(bible, "other-project").some(issue=>issue.includes("does not match"))).toBe(true);
  });

  it("does not leak a future scar or older future state into an earlier chapter", () => {
    const bible = seeded();
    const context = buildStyleBibleContext(bible, "project-1", "Draw Ren in chapter 1", 5200, 1);
    expect(context).toContain("short black undercut");
    expect(context).not.toContain("thin scar across left eyebrow");
    expect(context).not.toContain("grown-out black undercut");
  });

  it("does not promote unapproved character states into generated context", () => {
    const bible = seeded();
    bible.characterStates[1].status = "proposed";
    expect(buildStyleBibleContext(bible, "project-1", "Draw Ren in chapter 12")).not.toContain("thin scar across left eyebrow");
  });

  it("exposes the resolved approved visual state for a character at a specific story order", () => {
    const bible = seeded();
    bible.characterStates.push({ id:"state-3", characterName:"Ren", storyOrder:13, chapterLabel:"Chapter 13", hair:"longer hair", status:"approved" });
    const resolved = resolveCharacterVisualState(bible.characterStates, "Ren", 13);
    expect(resolved?.latest.chapterLabel).toBe("Chapter 13");
    expect(resolved?.traits.hair).toBe("longer hair");
    expect(resolved?.traits.scars).toBe("thin scar across left eyebrow");
    expect(resolveCharacterVisualState(bible.characterStates, "Ren", 1)?.traits.scars).toBe("none");
  });

  it("carries forward scars and other unchanged traits until an explicit change is recorded", () => {
    const bible = seeded();
    bible.characterStates.push({
      id: "state-3", characterName: "Ren", storyOrder: 13, chapterLabel: "Chapter 13",
      hair: "longer grown-out undercut", status: "approved",
    });
    const chapter13 = buildStyleBibleContext(bible, "project-1", "Draw Ren in chapter 13", 5200, 13);
    expect(chapter13).toContain("longer grown-out undercut");
    expect(chapter13).toContain("thin scar across left eyebrow");
    expect(chapter13).toContain("age: 18");

    bible.characterStates.push({
      id: "state-4", characterName: "Ren", storyOrder: 14, chapterLabel: "Chapter 14",
      scars: "none", status: "approved",
    });
    const chapter14 = buildStyleBibleContext(bible, "project-1", "Draw Ren in chapter 14", 5200, 14);
    expect(chapter14).toContain("scars: none");
    expect(chapter14).not.toContain("thin scar across left eyebrow");
  });
});
