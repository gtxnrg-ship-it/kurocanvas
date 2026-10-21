const DRAWING_INTENT = /\b(draw|sketch|illustrate|rough out|create (?:a )?(?:drawing|sketch|composition)|put .* on (?:the )?canvas)\b/i;

const CANVAS_VISUAL_INTENT = /\b(inspect|review|critique|analy[sz]e|compare|what do you see|how does .* look|look at (?:the )?canvas|look over (?:(?:the|this) )?(?:canvas|sketch|drawing)|current canvas|this sketch|this drawing|canvas image|what(?:'s| is) on (?:the )?canvas|feedback on (?:(?:the|this) )?(?:canvas|sketch|drawing)|describe (?:the )?canvas|is this (?:sketch|drawing|composition) (?:correct|working))\b/i;

export function isDrawingIntent(text: string): boolean {
  return DRAWING_INTENT.test(text);
}

export function isCanvasVisualIntent(text: string): boolean {
  return CANVAS_VISUAL_INTENT.test(text);
}

/** Vision previews are attached only when the selected model advertises vision support. */
export function shouldAttachCanvasPreview(text: string, capabilities: readonly string[]): boolean {
  return capabilities.includes("vision") && (isDrawingIntent(text) || isCanvasVisualIntent(text));
}
