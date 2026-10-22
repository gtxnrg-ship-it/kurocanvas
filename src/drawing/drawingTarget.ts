export interface DrawingTargetCandidate {
  id: string;
}

export interface DrawingTargetSelectionOptions {
  /**
   * A production session is bound to one document. If its target is missing,
   * fail closed instead of overwriting whichever drawing happens to be active.
   */
  productionSession: boolean;
  requestedDrawingId?: string;
  activeDrawingId?: string;
}

/**
 * Select a document for the current operation.
 *
 * Long-form production must keep using its exact session-owned document. When that
 * document is not in the saved drawing list (for example after interrupted save),
 * return undefined so the caller can recover or create that exact document.
 * Ordinary one-off visual edits prefer the explicitly active drawing, then the
 * most-recent saved drawing.
 */
export function chooseDrawingTarget<T extends DrawingTargetCandidate>(
  drawings: readonly T[],
  options: DrawingTargetSelectionOptions,
): T | undefined {
  if (options.productionSession) {
    if (!options.requestedDrawingId) return undefined;
    return drawings.find(drawing => drawing.id === options.requestedDrawingId);
  }
  return drawings.find(drawing => drawing.id === options.activeDrawingId) ?? drawings[0];
}
