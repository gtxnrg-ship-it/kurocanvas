const DRAWING_INTENT = /\b(draw|sketch|illustrate|rough out|create (?:a )?(?:drawing|sketch|composition)|put .* on (?:the )?canvas)\b/i;

// Route natural-language character-design requests to the editable drawing workflow,
// even when the user does not know to say "draw" or "canvas".
const CHARACTER_VISUAL_CREATION_INTENT = /\b(?:design|create|make|develop|visuali[sz]e|concept)\b(?:(?!\b(?:story|plot|backstory|worldbuilding)\b).){0,55}\b(?:characters?(?:[’']s?)?(?:\s+(?:overall\s+)?(?:look|appearance|design|sheet|concept|portrait|outfit|turnaround|expressions?|visual\s+design))?|character\s+sheets?|character\s+designs?|cast\s+(?:looks?|designs?|sheets?)|overall\s+looks?|visual\s+designs?|appearances?|costumes?|outfits?)\b/i;

const CANVAS_VISUAL_INTENT = /\b(inspect|review|critique|analy[sz]e|compare|what do you see|how does .* look|look at (?:the )?canvas|look over (?:(?:the|this) )?(?:canvas|sketch|drawing)|current canvas|this sketch|this drawing|canvas image|what(?:'s| is) on (?:the )?canvas|feedback on (?:(?:the|this) )?(?:canvas|sketch|drawing)|describe (?:the )?canvas|is this (?:sketch|drawing|composition) (?:correct|working))\b/i;

export function isDrawingIntent(text: string): boolean {
  return DRAWING_INTENT.test(text) || CHARACTER_VISUAL_CREATION_INTENT.test(text);
}

export function isCanvasVisualIntent(text: string): boolean {
  return CANVAS_VISUAL_INTENT.test(text);
}

/** Vision previews are attached only when the selected model advertises vision support. */
export function shouldAttachCanvasPreview(text: string, capabilities: readonly string[]): boolean {
  return capabilities.includes("vision") && (isDrawingIntent(text) || isCanvasVisualIntent(text));
}
