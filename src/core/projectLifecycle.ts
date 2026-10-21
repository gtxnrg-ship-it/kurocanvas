export interface ProjectLifecycleResearchRecord {
  id: string;
  projectId: string;
}

export interface ProjectDeletionOperations<TTask extends ProjectLifecycleResearchRecord> {
  loadProject(projectId: string): Promise<unknown | undefined>;
  listResearchTasks(projectId: string): Promise<TTask[]>;
  removeResearchTasks(projectId: string): Promise<void>;
  removeProjectData(projectId: string): Promise<void>;
  restoreResearchTasks(tasks: readonly TTask[], projectId: string): Promise<void>;
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown failure.");
}

/**
 * Remove project data that spans the core project database and the independent
 * research queue database. Research is removed first; if core deletion fails,
 * restore the saved research tasks so the project remains usable.
 *
 * IndexedDB cannot commit across two databases atomically, so this explicitly
 * compensates for a failed second step instead of silently leaving research behind.
 */
export async function deleteProjectWithResearch<TTask extends ProjectLifecycleResearchRecord>(
  projectId: string,
  operations: ProjectDeletionOperations<TTask>,
): Promise<void> {
  if (!projectId.trim()) throw new Error("Choose a project before deleting it.");
  const project = await operations.loadProject(projectId);
  if (!project) throw new Error("This project no longer exists in local storage.");

  const tasks = await operations.listResearchTasks(projectId);
  if (tasks.some(task => task.projectId !== projectId)) {
    throw new Error("Research cleanup refused to delete tasks owned by another project.");
  }

  // If this fails, leave the primary project untouched.
  await operations.removeResearchTasks(projectId);
  try {
    await operations.removeProjectData(projectId);
  } catch (deleteError) {
    if (tasks.length) {
      try {
        await operations.restoreResearchTasks(tasks, projectId);
      } catch (restoreError) {
        throw new Error(
          "Project deletion failed: " + describeFailure(deleteError)
          + ". Restoring its saved research tasks also failed: " + describeFailure(restoreError)
          + ". Inspect local storage before retrying so the remaining data can be recovered.",
        );
      }
    }
    throw deleteError;
  }
}
