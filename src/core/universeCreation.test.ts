import { describe, expect, it, vi } from "vitest";
import { createProjectWithUniverse } from "./universeCreation";

const project = { id: "project-1", name: "My world" };

describe("createProjectWithUniverse", () => {
  it("saves the project and returns its created universe", async () => {
    const saveProject = vi.fn(async () => {});
    const createUniverse = vi.fn(async (value: typeof project) => ({ id: "universe-1", projectId: value.id }));
    const removeProject = vi.fn(async () => {});

    await expect(createProjectWithUniverse(project, { saveProject, createUniverse, removeProject }))
      .resolves.toEqual({ project, universe: { id: "universe-1", projectId: "project-1" } });
    expect(saveProject).toHaveBeenCalledWith(project);
    expect(createUniverse).toHaveBeenCalledWith(project);
    expect(removeProject).not.toHaveBeenCalled();
  });

  it("removes the project if creating its universe fails", async () => {
    const failure = new Error("universe database unavailable");
    const removeProject = vi.fn(async () => {});
    await expect(createProjectWithUniverse(project, {
      saveProject: async () => {},
      createUniverse: async () => { throw failure; },
      removeProject,
    })).rejects.toBe(failure);
    expect(removeProject).toHaveBeenCalledWith(project.id);
  });

  it("reports both failures if compensation also fails", async () => {
    await expect(createProjectWithUniverse(project, {
      saveProject: async () => {},
      createUniverse: async () => { throw new Error("universe write failed"); },
      removeProject: async () => { throw new Error("project delete failed"); },
    })).rejects.toThrow(/universe write failed.*project delete failed/i);
  });

  it("does not attempt cleanup if saving the project itself fails", async () => {
    const removeProject = vi.fn(async () => {});
    await expect(createProjectWithUniverse(project, {
      saveProject: async () => { throw new Error("project write failed"); },
      createUniverse: async () => ({ id: "unused" }),
      removeProject,
    })).rejects.toThrow("project write failed");
    expect(removeProject).not.toHaveBeenCalled();
  });
});
