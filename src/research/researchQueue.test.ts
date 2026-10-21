import { describe, expect, it } from "vitest";
import {
  buildResearchContext, createResearchTask, parseWikipediaResearchPayload, validateResearchTask,
  type ResearchTaskRecord,
} from "./researchQueue";

describe("Kuro research queue records", () => {
  it("creates a project-scoped queued task with a requested depth", () => {
    const task = createResearchTask(
      { projectId: "brotherhood", query: "Ming dynasty military organization", depth: "deep" },
      () => "research-1",
      "2026-10-21T00:00:00.000Z",
    );
    expect(task.id).toBe("research-1");
    expect(task.status).toBe("queued");
    expect(task.depth).toBe("deep");
    expect(task.progress).toBe(0);
    expect(validateResearchTask(task, "brotherhood")).toEqual([]);
    expect(validateResearchTask(task, "another-series")).toContain("Research task belongs to another project.");
  });

  it("rejects empty queries and unsupported depth values", () => {
    expect(() => createResearchTask({ projectId: "series", query: " ", depth: "deep" }, () => "x")).toThrow(/query/i);
    expect(validateResearchTask({
      id: "x", projectId: "series", query: "history", depth: "infinite", status: "queued",
      progress: 0, stage: "Queued", sources: [], createdAt: "now", updatedAt: "now",
    })).toContain("Research depth is invalid.");
  });

  it("parses source titles, plain extracts and only Wikipedia URLs", () => {
    const sources = parseWikipediaResearchPayload({ query: { pages: {
      "1": { pageid: 1, title: "Ming dynasty", fullurl: "https://en.wikipedia.org/wiki/Ming_dynasty", extract: "The <b>Ming dynasty</b> was a dynasty of China." },
      "2": { pageid: 2, title: "Ming military", fullurl: "https://en.wikipedia.org/wiki/Ming_military", extract: "The military had many institutions." },
      "3": { pageid: 3, title: "Bad host", fullurl: "https://evil.example/ming", extract: "Should not be accepted." },
      "4": { pageid: 4, title: "No content", fullurl: "https://en.wikipedia.org/wiki/No_content", extract: "" },
    } } });
    expect(sources).toHaveLength(2);
    expect(sources[0].extract).toContain("Ming dynasty");
    expect(sources[0].extract).not.toContain("<b>");
    expect(sources[0].url).toContain("en.wikipedia.org");
  });

  it("builds factual research context only for the active project and relevant topic", async () => {
    const task: ResearchTaskRecord = {
      id: "r1", projectId: "brotherhood", query: "Ming dynasty military organization", depth: "deep",
      status: "completed", progress: 100, stage: "Research sources collected",
      sources: [{ title: "Ming dynasty", url: "https://en.wikipedia.org/wiki/Ming_dynasty", extract: "The Ming dynasty ruled China from 1368 to 1644." }],
      createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:10:00.000Z",
    };
    const relevant = await buildResearchContext([task], "brotherhood", "Help build a Ming dynasty military hierarchy.");
    expect(relevant).toContain("SAVED RESEARCH NOTES");
    expect(relevant).toContain(task.sources[0].url);
    expect(relevant).toContain("1368 to 1644");
    expect(relevant.toLocaleLowerCase()).toContain("not automatic canon");
    expect(await buildResearchContext([task], "another-series", "Ming dynasty military hierarchy")).toBe("");
    expect(await buildResearchContext([{ ...task, status: "queued", sources: [] }], "brotherhood", "Ming dynasty")).toBe("");
  });
});
