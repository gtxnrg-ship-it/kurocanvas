/**
 * Detect clear visual-production requests that should leave chat and enter Live Creation.
 * Ordinary character brainstorming stays in chat; a visible artifact/canvas request opts into drawing.
 */
export function shouldStartLiveCreationFromChat(message: string): boolean {
  const text = message.normalize("NFKC").trim();
  if (!text) return false;

  const visualVerb = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce)\b/i;
  const canvasTarget = /\b(?:on|onto|in|inside)\s+(?:the\s+)?(?:live\s+)?canvas\b/i;
  const explicitArtifact = /\b(?:character\s+sheet|character\s+turnaround|turnaround\s+sheet|storyboard|manga\s+panel|comic\s+panel|scene\s+illustration|concept\s+art|cityscape|world\s+map|location\s+map|environment\s+design|costume\s+design|outfit\s+design|background\s+art|portrait\s+of)\b/i;

  if (!visualVerb.test(text)) return false;
  if (canvasTarget.test(text)) return true;

  // The artifact must be the thing the user wants produced—not merely mentioned while researching.
  const verbBeforeArtifact = /\b(?:draw|sketch|illustrate|paint|render|visuali[sz]e|create|make|build|design|produce)\b[^.!?\n]{0,100}\b(?:character\s+sheet|character\s+turnaround|turnaround\s+sheet|storyboard|manga\s+panel|comic\s+panel|scene\s+illustration|concept\s+art|cityscape|world\s+map|location\s+map|environment\s+design|costume\s+design|outfit\s+design|background\s+art|portrait\s+of)\b/i;
  return explicitArtifact.test(text) && verbBeforeArtifact.test(text);
}
