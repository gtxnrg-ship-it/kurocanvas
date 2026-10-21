export function isExactPanelRecallRequest(query: string): boolean {
  return /\b(?:bring back|restore|reopen|retrieve|reuse|use again|show me|open|find the exact|find the original)\b/i.test(query) &&
    /\b(?:exact panel|original panel|previous panel|same panel|panel|template|saved drawing|previous drawing|original layout)\b/i.test(query);
}

export function findLinkedDrawingRef(assetRefs: readonly string[]): string | undefined {
  return assetRefs.find(ref => typeof ref === "string" && /^drawing:[^\s]+$/.test(ref));
}

/** Never pretend a text memory is the original visual asset. */
export function missingExactPanelAssetMessage(query: string, assetRefs: readonly string[]): string | undefined {
  if (!isExactPanelRecallRequest(query) || findLinkedDrawingRef(assetRefs)) return undefined;
  return "I couldn't find an actual saved drawing asset linked to that memory, so I can't restore the exact original panel or template. I won't invent a replacement and call it the original. Link the drawing in Story Vault, import the project package that contains it, or ask me to create a clearly labeled new recreation.";
}
