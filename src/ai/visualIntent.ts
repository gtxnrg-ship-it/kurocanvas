const DRAWING_INTENT = /\b(draw|sketch|illustrate|rough out|create (?:a )?(?:drawing|sketch|composition)|put .* on (?:the )?canvas)\b/i;

// Route natural-language character-design requests to the editable drawing workflow,
// even when the user does not know to say "draw" or "canvas".
const CHARACTER_VISUAL_CREATION_INTENT = /\b(?:design|create|make|develop|visuali[sz]e|concept)\b(?:(?!\b(?:story|plot|backstory|worldbuilding)\b).){0,55}\b(?:characters?(?:[’']s?)?(?:\s+(?:overall\s+)?(?:look|appearance|design|sheet|concept|portrait|outfit|turnaround|expressions?|visual\s+design))?|character\s+sheets?|character\s+designs?|cast\s+(?:looks?|designs?|sheets?)|overall\s+looks?|visual\s+designs?|appearances?|costumes?|outfits?)\b/i;

const DEFERRED_VISUAL_ACTION = /\b(?:don't|do\s+not|never|avoid|no\s+need\s+to|not\s+yet|wait\s+to|hold\s+off\s+on|let's\s+not)\s+(?:(?:please|just)\s+)?(?:draw|sketch|illustrate|rough\s+out|create|make|put|design|develop|visuali[sz]e|concept|inspect|review|critique|analy[sz]e|look\s+at|look\s+over|describe|compare|show)\b/i;
const POSITIVE_VISUAL_ACTION = /\b(?:draw|sketch|illustrate|rough\s+out|create|make|put|design|develop|visuali[sz]e|concept|inspect|review|critique|analy[sz]e|look\s+at|look\s+over|describe|compare|show)\b/i;

function explicitlyDefersVisualAction(text: string): boolean {
  const match = DEFERRED_VISUAL_ACTION.exec(text);
  if (!match) return false;
  const remainder = text.slice(match.index + match[0].length);
  const contrastingClause = remainder.match(/\b(?:but|instead|just|actually|rather|however)\b([\s\S]{0,160})/i)?.[1] ?? "";
  return !POSITIVE_VISUAL_ACTION.test(contrastingClause);
}

const CANVAS_VISUAL_INTENT = /\b(inspect|review|critique|analy[sz]e|compare|what do you see|how does .* look|look at (?:the )?canvas|look over (?:(?:the|this) )?(?:canvas|sketch|drawing)|current canvas|this sketch|this drawing|canvas image|what(?:'s| is) on (?:the )?canvas|feedback on (?:(?:the|this) )?(?:canvas|sketch|drawing)|describe (?:the )?canvas|is this (?:sketch|drawing|composition) (?:correct|working))\b/i;

export function isDrawingIntent(text: string): boolean {
  if (explicitlyDefersVisualAction(text)) return false;
  return DRAWING_INTENT.test(text) || CHARACTER_VISUAL_CREATION_INTENT.test(text);
}

export function isCanvasVisualIntent(text: string): boolean {
  if (explicitlyDefersVisualAction(text)) return false;
  return CANVAS_VISUAL_INTENT.test(text);
}

/** Vision previews are attached only when the selected model advertises vision support. */
export function shouldAttachCanvasPreview(text: string, capabilities: readonly string[]): boolean {
  return capabilities.includes("vision") && (isDrawingIntent(text) || isCanvasVisualIntent(text));
}
