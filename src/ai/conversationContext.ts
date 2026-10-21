import type { ModelMessage } from "./modelRegistry";

/**
 * Keep recent conversational turns available to the model without treating
 * summaries as a replacement for the durable transcript. Full history remains
 * stored by the conversation layer; this is only a bounded prompt window.
 */
export function buildKuroConversationTurns(
  messages: readonly { role: "user" | "kuro"; text: string }[],
  limit = 12,
  maxCharsPerMessage = 2400,
): ModelMessage[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.min(24, Math.floor(limit))) : 12;
  const safeChars = Number.isFinite(maxCharsPerMessage) ? Math.max(1, Math.min(6000, Math.floor(maxCharsPerMessage))) : 2400;
  return messages.slice(-safeLimit).flatMap(message => {
    if ((message.role !== "user" && message.role !== "kuro") || typeof message.text !== "string") return [];
    const content = message.text.trim();
    if (!content) return [];
    return [{
      role: message.role === "user" ? "user" as const : "assistant" as const,
      content: content.length > safeChars ? content.slice(0, safeChars) + " …[earlier turn clipped for context]" : content,
    }];
  });
}
