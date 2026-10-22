export interface TranscriptTurn {
  role: "user" | "kuro";
  text: string;
  tool?: string;
}

export function formatConversationTranscript(title: string, turns: readonly TranscriptTurn[]): string {
  const safeTitle = title.trim() || "Untitled conversation";
  const body = turns.map(turn => {
    const speaker = turn.role === "user" ? "You" : "Kuro";
    const tool = turn.tool?.trim() ? "\n[Activity: " + turn.tool.trim() + "]" : "";
    return speaker + "\n" + turn.text.trim() + tool;
  }).join("\n\n");
  return safeTitle + "\n" + "=".repeat(Math.min(80, Math.max(3, safeTitle.length))) + "\n\n"
    + (body || "(This conversation has no messages yet.)") + "\n";
}

export function conversationTranscriptFilename(title: string): string {
  const safe = title.normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return (safe || "kuro-conversation") + "-transcript.txt";
}
