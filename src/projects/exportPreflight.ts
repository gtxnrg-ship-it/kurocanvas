export interface DrawingMemoryReference {
  id: string;
  title: string;
  assetRefs: string[];
}

export interface MissingDrawingReference {
  drawingId: string;
  memoryTitles: string[];
}

/**
 * Finds Story Vault references that cannot be resolved to a saved drawing.
 * Export must not silently omit these assets: they may be reusable panels,
 * templates, or other creative material the user expects to travel with the project.
 */
export function findMissingDrawingReferences(
  memories: readonly DrawingMemoryReference[],
  availableDrawingIds: Iterable<string>,
): MissingDrawingReference[] {
  const available = new Set(availableDrawingIds);
  const owners = new Map<string, Set<string>>();

  for (const memory of memories) {
    for (const reference of memory.assetRefs) {
      if (!reference.startsWith("drawing:")) continue;
      const drawingId = reference.slice("drawing:".length).trim();
      if (drawingId && available.has(drawingId)) continue;
      const titles = owners.get(drawingId) ?? new Set<string>();
      titles.add(memory.title.trim() || "Untitled memory");
      owners.set(drawingId, titles);
    }
  }

  return [...owners.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([drawingId, titles]) => ({
      drawingId: drawingId || "(empty ID)",
      memoryTitles: [...titles].sort((left, right) => left.localeCompare(right)),
    }));
}

/**
 * The export manifest includes every saved drawing plus every drawing referenced by memory.
 * Keeping missing references in the manifest lets preflight fail loudly rather than hide data loss.
 */
export function collectProjectExportDrawingIds(
  memories: readonly DrawingMemoryReference[],
  availableDrawingIds: Iterable<string>,
): string[] {
  const ids = new Set(availableDrawingIds);
  for (const memory of memories) {
    for (const reference of memory.assetRefs) {
      if (!reference.startsWith("drawing:")) continue;
      const id = reference.slice("drawing:".length).trim();
      if (id) ids.add(id);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}
