import { describe, expect, it } from "vitest";
import {
  buildResearchContext, createResearchTask, extractResearchTaskIntent, isResearchFollowUpRequest, ownsResearchLease, normalizeImportedResearchTasks, parseCrossrefWorksPayload, parseWikipediaResearchPayload, validateResearchTask,
  type ResearchTaskRecord,
} from "./researchQueue";

describe("research lease ownership", () => {
  const claimed: ResearchTaskRecord = {
    ...createResearchTask({ projectId: "series-a", query: "Ming history", depth: "deep" }, () => "lease-task"),
    status: "running",
    leaseUntil: 20_000,
    leaseOwnerId: "tab-a",
  };

  it("accepts only the current unexpired owner token", () => {
    expect(ownsResearchLease(claimed, "lease-task", "series-a", "tab-a", 19_999)).toBe(true);
    expect(ownsResearchLease(claimed, "lease-task", "series-a", "tab-b", 19_999)).toBe(false);
    expect(ownsResearchLease(claimed, "lease-task", "series-b", "tab-a", 19_999)).toBe(false);
    expect(ownsResearchLease(claimed, "another-task", "series-a", "tab-a", 19_999)).toBe(false);
  });

  it("rejects expired leases and tasks no longer running", () => {
    expect(ownsResearchLease(claimed, "lease-task", "series-a", "tab-a", 20_000)).toBe(false);
    expect(ownsResearchLease({ ...claimed, status: "completed" }, "lease-task", "series-a", "tab-a", 19_999)).toBe(false);
    expect(ownsResearchLease({ ...claimed, leaseOwnerId: undefined }, "lease-task", "series-a", "tab-a", 19_999)).toBe(false);
  });
});

describe("portable research task history", () => {
  it("preserves completed source findings but pauses unfinished jobs on import", () => {
    const completed: ResearchTaskRecord = {
      ...createResearchTask({ projectId: "series-old", query: "Ming dynasty", depth: "deep" }, () => "task-done"),
      status: "completed", progress: 100, stage: "Research sources collected",
      sources: [{ title: "Ming dynasty", url: "https://en.wikipedia.org/wiki/Ming_dynasty", extract: "Founded in 1368." }],
      completedAt: "2026-10-20T12:00:00.000Z",
    };
    const queued = createResearchTask({ projectId: "series-old", query: "Ming dynasty armour", depth: "exhaustive" }, () => "task-queued");
    const running = { ...queued, id: "task-running", status: "running" as const, progress: 32, leaseUntil: Date.now() + 120000, leaseOwnerId: "old-tab-claim" };
    let ids = 0;
    const imported = normalizeImportedResearchTasks([completed, queued, running], "series-old", "series-new", () => "fresh-" + (++ids), "2026-10-21T00:00:00.000Z");
    expect(imported.map(task => task.id)).toEqual(["fresh-1", "fresh-2", "fresh-3"]);
    expect(imported.every(task => task.projectId === "series-new")).toBe(true);
    expect(imported[0]).toMatchObject({ status: "completed", progress: 100, sources: completed.sources, completedAt: completed.completedAt });
    expect(imported[1]).toMatchObject({ status: "cancelled", progress: 0, stage: expect.stringContaining("retry") });
    expect(imported[2]).toMatchObject({ status: "cancelled", progress: 32, leaseUntil: undefined, stage: expect.stringContaining("retry") });
    expect(imported[2].leaseOwnerId).toBeUndefined();
  });

  it("rejects cross-project task records, duplicate IDs, and malformed source URLs", () => {
    const task = createResearchTask({ projectId: "series-a", query: "Ming dynasty", depth: "balanced" }, () => "task-1");
    expect(() => normalizeImportedResearchTasks([task], "series-b", "series-new")).toThrow(/different project/i);
    expect(() => normalizeImportedResearchTasks([task, task], "series-a", "series-new")).toThrow(/duplicate IDs/i);
    expect(() => normalizeImportedResearchTasks([{ ...task, sources: [{ title: "bad", url: "https://evil.example/", extract: "payload" }] }], "series-a", "series-new")).toThrow(/Wikipedia source/i);
  });
});

describe("Kuro research queue records", () => {
  it("detects source-dependent follow-ups without classifying ordinary story questions as research", () => {
    expect(isResearchFollowUpRequest("Summarize those findings with citations.")).toBe(true);
    expect(isResearchFollowUpRequest("Based on your research, what should the manga creator know?")).toBe(true);
    expect(isResearchFollowUpRequest("What did the sources find about panel pacing?")).toBe(true);
    expect(isResearchFollowUpRequest("What did you discover about the temple in this scene?")).toBe(false);
    expect(isResearchFollowUpRequest("Write a scene where the detective finds a clue.")).toBe(false);
    expect(isResearchFollowUpRequest("The research student finds a clue in chapter two.")).toBe(false);
    expect(isResearchFollowUpRequest("The sources of magic are six ancient clans.")).toBe(false);
    expect(isResearchFollowUpRequest("Cite the sources when you summarize the findings.")).toBe(true);
  });

  it("routes explicit research commands into scoped tasks and preserves source/depth choices", () => {
    expect(extractResearchTaskIntent("Please research the history of manga censorship and cite sources")).toEqual({
      query: "the history of manga censorship",
      depth: "deep",
      sourceProvider: "wikipedia",
    });
    expect(extractResearchTaskIntent("Search Crossref for scholarly papers about manga panel pacing")).toEqual({
      query: "scholarly papers about manga panel pacing",
      depth: "deep",
      sourceProvider: "crossref",
    });
    expect(extractResearchTaskIntent("Quickly look up Ming dynasty armor")).toMatchObject({
      query: "Ming dynasty armor",
      depth: "quick",
    });
    expect(extractResearchTaskIntent("Write a scene where the historian researches a temple")).toBeUndefined();
    expect(extractResearchTaskIntent("Research")).toBeUndefined();
  });


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

  it("parses Crossref work metadata, cleans markup, and builds canonical DOI links", () => {
    const sources = parseCrossrefWorksPayload({ message: { items: [
      {
        DOI: "10.1234/test-paper",
        title: ["A Study of <jats:italic>Worldbuilding</jats:italic>"],
        author: [{ given: "Ada", family: "Lovelace" }, { given: "Grace", family: "Hopper" }],
        publisher: "Example Press",
        "container-title": ["Journal of Example Studies"],
        "published-print": { "date-parts": [[2024, 5, 2]] },
        abstract: "<jats:p>This &amp; that is a deposited abstract.</jats:p>",
      },
      { DOI: "not-a-doi", title: ["Invalid record"] },
      { DOI: "10.1234/missing-title", title: [] },
    ] } });
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("A Study of Worldbuilding");
    expect(sources[0].url).toBe("https://doi.org/10.1234/test-paper");
    expect(sources[0].extract).toContain("Authors: Ada Lovelace, Grace Hopper");
    expect(sources[0].extract).toContain("Published: 2024");
    expect(sources[0].extract).toContain("This & that is a deposited abstract.");
    expect(sources[0].extract).not.toContain("<jats:");
  });

  it("keeps older saved tasks valid and permits only canonical DOI metadata URLs", () => {
    const oldTask = createResearchTask({ projectId: "series-a", query: "history of printing", depth: "balanced" }, () => "old-task");
    const scholarly = createResearchTask({ projectId: "series-a", query: "history of printing", depth: "deep", sourceProvider: "crossref" }, () => "scholarly-task");
    const doiSource = { title: "A publication", url: "https://doi.org/10.1234/example", extract: "DOI: 10.1234/example." };
    expect(oldTask.sourceProvider).toBe("wikipedia");
    expect(validateResearchTask({ ...oldTask, sourceProvider: undefined, sources: [] }, "series-a")).toEqual([]);
    expect(validateResearchTask({ ...scholarly, sources: [doiSource] }, "series-a")).toEqual([]);
    expect(validateResearchTask({ ...scholarly, sources: [{ ...doiSource, url: "https://evil.example/10.1234/example" }] }, "series-a"))
      .toContain("Wikipedia source URLs must use en.wikipedia.org HTTPS paths; Crossref source URLs must use canonical doi.org DOI links.");
    expect(validateResearchTask({ ...scholarly, sourceProvider: "arbitrary" }, "series-a"))
      .toContain("Research source provider is invalid.");
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
    const followUp = await buildResearchContext([task], "brotherhood", "Summarize those findings with citations.");
    expect(followUp).toContain(task.sources[0].url);
    expect(await buildResearchContext([task], "another-series", "Ming dynasty military hierarchy")).toBe("");
    expect(await buildResearchContext([{ ...task, status: "queued", sources: [] }], "brotherhood", "Ming dynasty")).toBe("");
  });
});
