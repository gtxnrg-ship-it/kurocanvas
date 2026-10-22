export interface DrawingTargetCandidate {
  id: string;
}

export interface DrawingTargetSelectionOptions {
  /** A fresh chapter storyboard must not fall back to a different saved drawing. */
  chapterStoryboardRequest: boolean;
  requestedDrawingId?: string;
  activeDrawingId?: string;
}

/**
 * Pick a document without allowing a new chapter request to silently reuse the active
 * drawing. Ordinary visual edits prefer the explicit active drawing, then the project's
 * most-recent drawing. A chapter request may reuse only its exact already-created target.
 */
export function chooseDrawingTarget<T extends DrawingTargetCandidate>(
  drawings: readonly T[],
  options: DrawingTargetSelectionOptions,
): T | undefined {
  if (options.chapterStoryboardRequest) {
    return options.requestedDrawingId
      ? drawings.find(drawing => drawing.id === options.requestedDrawingId)
      : undefined;
  }
  return drawings.find(drawing => drawing.id === options.activeDrawingId) ?? drawings[0];
}
