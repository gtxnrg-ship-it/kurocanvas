export interface DrawingAssetOwnerReference {
  title: string;
  assetRefs: string[];
}

export interface MissingDrawingReference {
  drawingId: string;
  ownerTitles: string[];
}

/**
 * Finds project-owned continuity references that cannot be resolved to a saved drawing.
 * Owners may be Story Vault memories or character timeline snapshots; both must
 * remain usable after the project is moved to another device.
 */
export function findMissingDrawingReferences(
  owners: readonly DrawingAssetOwnerReference[],
  availableDrawingIds: Iterable<string>,
): MissingDrawingReference[] {
  const available = new Set(availableDrawingIds);
  const referencesByDrawing = new Map<string, Set<string>>();

  for (const owner of owners) {
    for (const reference of owner.assetRefs) {
      if (!reference.startsWith("drawing:")) continue;
      const drawingId = reference.slice("drawing:".length).trim();
      if (drawingId && available.has(drawingId)) continue;
      const titles = referencesByDrawing.get(drawingId) ?? new Set<string>();
      titles.add(owner.title.trim() || "Untitled continuity record");
      referencesByDrawing.set(drawingId, titles);
    }
  }

  return [...referencesByDrawing.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([drawingId, titles]) => ({
      drawingId: drawingId || "(empty ID)",
      ownerTitles: [...titles].sort((left, right) => left.localeCompare(right)),
    }));
}

/**
 * The archive contains every saved drawing, including unlinked canvases. Story Vault references
 * are also added to the manifest so preflight can detect missing references rather than hide loss.
 */
export function collectProjectExportDrawingIds(
  memories: readonly DrawingAssetOwnerReference[],
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

/**
 * Validate drawing identities in an imported package before remapping any IDs.
 * If two paths claim the same source ID, the old -> new ID map would otherwise
 * silently point every continuity reference at whichever file happened to be read last.
 */
export function validateImportedDrawingEntries(entries: Iterable<readonly [string, string]>): void {
  const prefix = "kuro/drawings/";
  const suffix = ".json";
  const drawings: Array<{ key: string; id: string; pathId: string }> = [];

  for (const [key, raw] of entries) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("A bundled drawing is not valid JSON: " + key);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("A bundled drawing is invalid: " + key);
    }

    const id = (value as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("A bundled drawing has no stable ID: " + key);
    }
    drawings.push({ key, id, pathId: key.slice(prefix.length, -suffix.length) });
  }

  // Check source identity duplication first so the most important failure is
  // reported even if one of the duplicated records also has a misnamed path.
  const seenIds = new Set<string>();
  for (const drawing of drawings) {
    if (seenIds.has(drawing.id)) {
      throw new Error("The project package contains duplicate drawing IDs: " + drawing.id);
    }
    seenIds.add(drawing.id);
  }
  for (const drawing of drawings) {
    if (drawing.id !== drawing.pathId) {
      throw new Error("A bundled drawing's file path does not match its internal ID: " + drawing.key);
    }
  }
}
