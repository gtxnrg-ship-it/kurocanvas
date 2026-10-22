/**
 * Create a project and its initial universe across separate storage writes.
 * If the universe write fails, compensate for the project write so the UI
 * cannot leave an unreachable project behind.
 */
export interface ProjectUniverseCreationOperations<TProject extends { id: string }, TUniverse> {
  saveProject(project: TProject): Promise<void>;
  createUniverse(project: TProject): Promise<TUniverse>;
  removeProject(projectId: string): Promise<void>;
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown failure.");
}

export async function createProjectWithUniverse<TProject extends { id: string }, TUniverse>(
  project: TProject,
  operations: ProjectUniverseCreationOperations<TProject, TUniverse>,
): Promise<{ project: TProject; universe: TUniverse }> {
  await operations.saveProject(project);
  try {
    const universe = await operations.createUniverse(project);
    return { project, universe };
  } catch (creationError) {
    try {
      await operations.removeProject(project.id);
    } catch (cleanupError) {
      throw new Error(
        "Universe creation failed: " + describeFailure(creationError)
        + ". Cleanup of the incomplete project also failed: " + describeFailure(cleanupError)
        + ". Check local storage before retrying.",
      );
    }
    throw creationError;
  }
}
