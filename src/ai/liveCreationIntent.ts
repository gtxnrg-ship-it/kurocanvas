/**
 * Detect clear visual-production requests that should leave chat and enter Live Creation.
 * Ordinary character brainstorming stays in chat; a visible artifact/canvas request opts into drawing.
 */
export function shouldStartLiveCreationFromChat(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (!text) return false;

  const negatedVisualAction = /\b(?:don't|do\s+not|never|stop|avoid|no\s+need\s+to|not\s+yet)\s+(?:(?:please|just)\s+)?(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce)\b/i;
  if (negatedVisualAction.test(text)) return false;

  const visualVerb = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce|start\s+(?:drawing|sketching|creating))\b/i;
  const canvasTarget = /\b(?:on|onto|in|inside)\s+(?:the\s+)?(?:live\s+)?canvas\b/i;
  const directDrawingCommand = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e)\s+(?:(?:a|an|the|our|my|this|that)\s+)?(?:character|characters|protagonist|hero|villain|her|him|them|it)(?!['’]\w)\b/i;
  const visualArtifact = /\b(?:character(?:['’]s|s['’]|s)?\s+(?:sheet|turnaround|design\s+sheet|reference\s+sheet|model\s+sheet|concept\s+art|illustration|portrait|visuals?|visual\s+design|(?:(?:overall\s+)?looks?|appearances?))|turnaround\s+sheet|visual\s+reference\s+sheet|storyboard|manga\s+panel|comic\s+panel|scene\s+illustration|concept\s+art|cityscape|world\s+map|location\s+map|environment\s+design|costume\s+design|outfit\s+design|background\s+art|portrait\s+of|(?:character|protagonist|hero|villain)\s+from\s+head\s+to\s+toe|(?:(?:overall\s+)?looks?)\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain)|appearances?\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain))\b/i;

  if (!visualVerb.test(text)) return false;
  if (canvasTarget.test(text) || directDrawingCommand.test(text)) return true;

  // Only route a request that asks to produce the visual artifact. Merely discussing a look or researching references stays in chat.
  const verbBeforeArtifact = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce|start\s+(?:drawing|sketching|creating))\b[^.!?\n]{0,120}\b(?:character(?:['’]s|s['’]|s)?\s+(?:sheet|turnaround|design\s+sheet|reference\s+sheet|model\s+sheet|concept\s+art|illustration|portrait|visuals?|visual\s+design|(?:(?:overall\s+)?looks?|appearances?))|turnaround\s+sheet|visual\s+reference\s+sheet|storyboard|manga\s+panel|comic\s+panel|scene\s+illustration|concept\s+art|cityscape|world\s+map|location\s+map|environment\s+design|costume\s+design|outfit\s+design|background\s+art|portrait\s+of|(?:character|protagonist|hero|villain)\s+from\s+head\s+to\s+toe|(?:(?:overall\s+)?looks?)\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain)|appearances?\s+(?:for|of)\s+(?:the\s+)?(?:main\s+)?(?:character|protagonist|hero|villain))\b/i;
  return visualArtifact.test(text) && verbBeforeArtifact.test(text);
}
