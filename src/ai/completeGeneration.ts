import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";

/**
 * Qwen runs in browser/WASM memory, so each inference pass stays bounded.
 * The user-facing answer may span multiple passes; the pass limit is not a
 * whole-response limit.
 */
export const KURO_LOCAL_MAX_TOKENS_PER_PASS = 1024;
export const KURO_LOCAL_MAX_TOKENS_PER_REPLY = 12288;
const LOCAL_PROVIDER_ID = "kuro-local-browser";
const COMPLETE_SENTINEL = "[KURO_REPLY_COMPLETE]";

function textOf(content: ModelRequest["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  return content.map(part => part.type === "text" ? part.text : "[image input]").join("");
}

function countOutputTokens(response: ModelResponse): number {
  const reported = response.usage?.outputTokens;
  if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) {
    return Math.ceil(reported);
  }
  // Local Qwen reports exact generated token IDs. This conservative fallback
  // keeps alternate test providers from creating an unbounded continuation loop.
  return Math.max(1, Math.ceil(response.text.length / 3));
}

function joinContinuationChunks(parts: readonly string[]): string {
  let result = "";
  for (const rawChunk of parts) {
    if (!rawChunk) continue;
    if (!result) {
      result = rawChunk;
      continue;
    }

    let chunk = rawChunk;
    // Ask the model to repeat a short overlap on continuation. Remove only
    // exact text overlap so a repeated transition doesn't appear in the answer.
    const maxOverlap = Math.min(600, result.length, chunk.length);
    let overlap = 0;
    for (let size = maxOverlap; size >= 24; size--) {
      if (result.endsWith(chunk.slice(0, size))) {
        overlap = size;
        break;
      }
    }
    if (overlap > 0) chunk = chunk.slice(overlap);
    if (!chunk) continue;

    const left = result[result.length - 1] ?? "";
    const right = chunk[0] ?? "";
    if (/\s/.test(left) || /\s/.test(right) || !left || !right) {
      result += chunk;
      continue;
    }
    if (/^(?:#{1,6}\s|[-*+]\s|>\s|\x60\x60\x60|\d+[.)]\s)/.test(chunk)) {
      result += "\n\n" + chunk;
      continue;
    }
    // Inference can stop at arbitrary token boundaries. A space is safer than
    // injecting a paragraph break into a sentence; continuation prompts request
    // an exact overlap to repair the more ambiguous mid-word case.
    result += " " + chunk;
  }
  return result.trim();
}

function withCombinedText(
  response: ModelResponse,
  parts: string[],
  finishReason: ModelResponse["finishReason"],
  outputTokens: number,
): ModelResponse {
  return {
    ...response,
    text: joinContinuationChunks(parts),
    finishReason,
    usage: { ...response.usage, outputTokens },
  };
}

/**
 * Generates a complete local chat response over bounded inference passes.
 *
 * Only ordinary prose chat should use this helper. Structured JSON/tool plans
 * must stay single-pass so their schemas and approval boundaries remain intact.
 */
export async function generateCompleteLocalReply(
  provider: ModelProvider,
  request: ModelRequest,
  model: ModelDescriptor,
): Promise<ModelResponse> {
  const requestedBudget = request.maxOutputTokens ?? KURO_LOCAL_MAX_TOKENS_PER_PASS;
  if (provider.id !== LOCAL_PROVIDER_ID || requestedBudget <= KURO_LOCAL_MAX_TOKENS_PER_PASS) {
    return provider.generate(request, model);
  }

  const totalBudget = Math.max(16, Math.min(KURO_LOCAL_MAX_TOKENS_PER_REPLY, Math.floor(requestedBudget)));
  const originalUserRequest = [...request.messages].reverse().find(message => message.role === "user");
  const originalRequestText = originalUserRequest ? textOf(originalUserRequest.content) : "";
  const parts: string[] = [];
  const continuationPrompt = () => [
    "Continue the answer from exactly where it stopped. Do not restart, recap, repeat a completed section, or add an introduction.",
    "Honor the creator's original request and constraints. Continue the next unfinished sentence or section, using the existing answer as context.",
    "Begin by repeating the exact overlap text below verbatim, then continue beyond it. The application removes an exact repeated prefix. Do not paraphrase that overlap.",
    "Exact overlap to repeat first:\n" + parts.join("").slice(-240),
    "If the answer is already complete and nothing meaningful remains, reply with exactly " + COMPLETE_SENTINEL + ".",
    originalRequestText ? "Original user request (preserve its intent and constraints):\n" + originalRequestText.slice(-2400) : "",
  ].filter(Boolean).join("\n\n");

  let outputTokens = 0;
  let lastResponse: ModelResponse | undefined;
  const maxPasses = Math.ceil(totalBudget / KURO_LOCAL_MAX_TOKENS_PER_PASS);

  for (let pass = 0; pass < maxPasses && outputTokens < totalBudget; pass++) {
    if (request.signal?.aborted) {
      if (lastResponse && parts.length) return withCombinedText(lastResponse, parts, "cancelled", outputTokens);
      return {
        text: "",
        modelId: model.id,
        providerId: provider.id,
        finishReason: "cancelled",
        usage: { outputTokens },
      };
    }

    const remainingBudget = totalBudget - outputTokens;
    const passMessages = pass === 0
      ? request.messages
      : [
          ...request.messages,
          { role: "assistant" as const, content: parts.join("\n\n") },
          { role: "user" as const, content: continuationPrompt().join("\n\n") },
        ];

    let response: ModelResponse;
    try {
      response = await provider.generate({
        ...request,
        messages: passMessages,
        maxOutputTokens: Math.min(KURO_LOCAL_MAX_TOKENS_PER_PASS, remainingBudget),
      }, model);
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && /cancel/i.test(error.message))) {
        if (lastResponse && parts.length) return withCombinedText(lastResponse, parts, "cancelled", outputTokens);
        return {
          text: "",
          modelId: model.id,
          providerId: provider.id,
          finishReason: "cancelled",
          usage: { outputTokens },
        };
      }
      if (lastResponse && parts.length) return withCombinedText(lastResponse, parts, "error", outputTokens);
      throw new Error("Kuro's local generation failed before a reply was produced. Check the model status in Preferences and try again.");
    }

    lastResponse = response;
    if (response.finishReason === "cancelled") {
      return parts.length ? withCombinedText(response, parts, "cancelled", outputTokens) : response;
    }

    const chunk = response.text;
    if (!chunk.trim()) {
      if (parts.length) return withCombinedText(response, parts, "error", outputTokens);
      return response;
    }

    if (chunk.trim() === COMPLETE_SENTINEL) {
      return withCombinedText(response, parts, "stop", outputTokens);
    }

    parts.push(chunk);
    outputTokens += Math.min(countOutputTokens(response), remainingBudget);

    if (response.finishReason !== "length") {
      return withCombinedText(response, parts, response.finishReason, outputTokens);
    }
  }

  if (!lastResponse) {
    return { text: "", modelId: model.id, providerId: provider.id, finishReason: "error", usage: { outputTokens: 0 } };
  }
  return withCombinedText(lastResponse, parts, "length", outputTokens);
}
