import { describe, expect, it } from "vitest";
import { deleteProjectWithResearch } from "./projectLifecycle";

type Task = { id: string; projectId: string; status: string };
type Operations = {
  loadProject: (id: string) => Promise<unknown | undefined>;
  listResearchTasks: (id: string) => Promise<Task[]>;
  removeResearchTasks: (id: string) => Promise<void>;
  removeProjectData: (id: string) => Promise<void>;
  restoreResearchTasks: (records: readonly Task[], id: string) => Promise<void>;
};

function fixture(overrides: Partial<Operations> = {}) {
  const events: string[] = [];
  const tasks: Task[] = [{ id: "research-1", projectId: "series-a", status: "completed" }];
  const operations: Operations = {
    loadProject: async (id: string) => { events.push("load:" + id); return { id }; },
    listResearchTasks: async (id: string) => { events.push("list:" + id); return tasks.filter(task => task.projectId === id); },
    removeResearchTasks: async (id: string) => { events.push("remove-research:" + id); },
    removeProjectData: async (id: string) => { events.push("remove-project:" + id); },
    restoreResearchTasks: async (records: readonly Task[], id: string) => { events.push("restore-research:" + id + ":" + records.length); },
    ...overrides,
  };
  return { events, tasks, operations };
}

describe("cross-database project deletion", () => {
  it("removes research first and then deletes the project data", async () => {
    const { events, operations } = fixture();
    await deleteProjectWithResearch("series-a", operations);
    expect(events).toEqual([
      "load:series-a", "list:series-a", "remove-research:series-a", "remove-project:series-a",
    ]);
  });

  it("does not touch project data when research cleanup fails", async () => {
    const { events, operations } = fixture({
      removeResearchTasks: async () => { events.push("remove-research:series-a"); throw new Error("research database unavailable"); },
    });
    await expect(deleteProjectWithResearch("series-a", operations)).rejects.toThrow(/research database unavailable/);
    expect(events).not.toContain("remove-project:series-a");
  });

  it("restores research history when the core project deletion fails", async () => {
    const { events, operations } = fixture({
      removeProjectData: async () => { events.push("remove-project:series-a"); throw new Error("core database unavailable"); },
    });
    await expect(deleteProjectWithResearch("series-a", operations)).rejects.toThrow(/core database unavailable/);
    expect(events).toContain("restore-research:series-a:1");
  });

  it("reports both failures if compensation also fails", async () => {
    const { operations } = fixture({
      removeProjectData: async () => { throw new Error("core database unavailable"); },
      restoreResearchTasks: async () => { throw new Error("research restore unavailable"); },
    });
    await expect(deleteProjectWithResearch("series-a", operations))
      .rejects.toThrow(/core database unavailable.*research restore unavailable/i);
  });

  it("refuses blank IDs and missing projects before deleting anything", async () => {
    const { events, operations } = fixture();
    await expect(deleteProjectWithResearch(" ", operations)).rejects.toThrow(/choose a project/i);
    const missing = { ...operations, loadProject: async () => undefined };
    await expect(deleteProjectWithResearch("missing", missing)).rejects.toThrow(/no longer exists/i);
    expect(events).toEqual([]);
  });
});
