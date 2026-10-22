/**
 * Detect clear visual-production requests that should leave chat and enter Live Creation.
 * Keep ordinary brainstorming in chat, but accept natural language about changing a character's visible appearance.
 */
export function shouldStartLiveCreationFromChat(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (!text) return false;

  // Respect a clear request to defer visual work, but do not let a negated clause
  // cancel a separate positive instruction such as "don't change her outfit, just shorten her hair".
  const negatedVisualAction = /\b(?:(?:don't|do\s+not)(?:\s+(?:(?:want|need)(?:\s+you)?\s+to))?|never|stop|avoid|no\s+need\s+to|not\s+yet|wait\s+to|hold\s+off\s+on|let's\s+not)\s+(?:(?:please|just)\s+)?(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce|change|update|adjust|add|remove|show)\b/i;
  const negatedMatch = negatedVisualAction.exec(text);
  if (negatedMatch) {
    const remainder = text.slice((negatedMatch.index ?? 0) + negatedMatch[0].length);
    const contrastingClause = remainder.match(/\b(?:but|instead|just|actually|rather|however)\b([\s\S]{0,160})/i)?.[1] ?? "";
    const positiveVisualAction = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce|change|update|adjust|add|remove|show|give|put)\b/i;
    if (!positiveVisualAction.test(contrastingClause)) return false;
  }

  const visualVerb = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce|start\s+(?:drawing|sketching|creating))\b/i;
  const canvasTarget = /\b(?:on|onto|in|inside)\s+(?:the\s+)?(?:live\s+)?canvas\b/i;
  const directDrawingCommand = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e)\s+(?:(?:a|an|the|our|my|this|that)\s+)?(?:character|characters|protagonist|hero|villain|her|him|them|it)(?!['’]\w)\b/i;
  const visualArtifact = /\b(?:character(?:['’]s|s['’]|s)?\s+(?:sheet|turnaround|design\s+sheet|reference\s+sheet|model\s+sheet|concept\s+art|illustration|portrait|visuals?|visual\s+design|(?:(?:overall\s+)?looks?|appearances?))|turnaround\s+sheet|visual\s+reference\s+sheet|storyboard|manga\s+panel|comic\s+panel|scene\s+illustration|concept\s+art|cityscape|world\s+map|location\s+map|environment\s+design|costume\s+design|outfit\s+design|background\s+art|portrait\s+of|(?:character|protagonist|hero|villain)\s+from\s+head\s+to\s+toe|(?:(?:overall\s+)?looks?)\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain)|appearances?\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain))\b/i;

  if (canvasTarget.test(text) || directDrawingCommand.test(text)) return true;

  // Common character revisions should work without requiring users to know the phrase "character sheet".
  const appearanceSubject = /\b(?:the\s+)?(?:character|protagonist|hero|villain|girl|boy|woman|man|her|him|them|she|he|they|their|his)\b/i;
  const appearanceDetail = /\b(?:look|looks|appearance|appearances|hair|eyes|face|skin|scar|scars|injur(?:y|ies)|outfit|clothes|coat|dress|armor|armour|accessor(?:y|ies)|glasses|build|hairstyle|silhouette|color scheme|colour scheme)\b/i;
  const appearanceAction = /\b(?:make|change|update|adjust|redesign|revise|give|add|remove|put|show|depict|design|create|draw|sketch|illustrate|paint|render)\b/i;
  const directAppearanceEdit = appearanceAction.test(text)
    && appearanceSubject.test(text)
    && appearanceDetail.test(text);
  if (directAppearanceEdit) return true;

  if (!visualVerb.test(text)) return false;

  // Only route a request that asks to produce the visual artifact. Merely discussing a look or researching references stays in chat.
  const verbBeforeArtifact = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce|start\s+(?:drawing|sketching|creating))\b[^.!?\n]{0,120}\b(?:character(?:['’]s|s['’]|s)?\s+(?:sheet|turnaround|design\s+sheet|reference\s+sheet|model\s+sheet|concept\s+art|illustration|portrait|visuals?|visual\s+design|(?:(?:overall\s+)?looks?|appearances?))|turnaround\s+sheet|visual\s+reference\s+sheet|storyboard|manga\s+panel|comic\s+panel|scene\s+illustration|concept\s+art|cityscape|world\s+map|location\s+map|environment\s+design|costume\s+design|outfit\s+design|background\s+art|portrait\s+of|(?:character|protagonist|hero|villain)\s+from\s+head\s+to\s+toe|(?:(?:overall\s+)?looks?)\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain)|appearances?\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain))\b/i;
  return visualArtifact.test(text) && verbBeforeArtifact.test(text);
}
