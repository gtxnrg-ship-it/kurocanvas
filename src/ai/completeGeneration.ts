import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";

/**
 * Qwen runs in browser/WASM memory, so each inference pass stays bounded.
 * The user-facing answer may span multiple passes; the pass limit is not a
 * whole-response limit.
 */
export const KURO_LOCAL_MAX_TOKENS_PER_PASS = 1024;
export const KURO_LOCAL_MAX_TOKENS_PER_REPLY = 6144;
const LOCAL_PROVIDER_ID = "kuro-local-browser";
const COMPLETE_SENTINEL = "[KURO_REPLY_COMPLETE]";

function textOf(content: ModelRequest["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  return content.map(part => part.type === "text" ? part.text : "[image input]");
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

function withCombinedText(
  response: ModelResponse,
  parts: string[],
  finishReason: ModelResponse["finishReason"],
  outputTokens: number,
): ModelResponse {
  return {
    ...response,
    text: parts.join("\n\n").trim(),
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
  const continuationPrompt = [
    "Continue the answer from exactly where it stopped. Do not restart, recap, repeat a completed section, or add an introduction.",
    "Honor the creator's original request and constraints. Continue the next unfinished sentence or section, using the existing answer as context.",
    "If the answer is already complete and nothing meaningful remains, reply with exactly " + COMPLETE_SENTINEL + ".",
    originalRequestText ? "Original user request (preserve its intent and constraints):\n" + originalRequestText.slice(-2400) : "",
  ].filter(Boolean).join("\n\n");

  const parts: string[] = [];
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
          { role: "user" as const, content: continuationPrompt },
        ];

    let response: ModelResponse;
    try {
      response = await provider.generate({
        ...request,
        messages: passMessages,
        maxOutputTokens: Math.min(KURO_LOCAL_MAX_TOKENS_PER_PASS, remainingBudget),
      }, model);
    } catch {
      if (lastResponse && parts.length) return withCombinedText(lastResponse, parts, "error", outputTokens);
      throw new Error("Kuro's local generation failed before a reply was produced. Check the model status in Preferences and try again.");
    }

    lastResponse = response;
    if (response.finishReason === "cancelled") {
      return parts.length ? withCombinedText(response, parts, "cancelled", outputTokens) : response;
    }

    const chunk = response.text.trim();
    if (!chunk) {
      if (parts.length) return withCombinedText(response, parts, "error", outputTokens);
      return response;
    }

    if (chunk === COMPLETE_SENTINEL) {
      return withCombinedText(response, parts, "stop", outputTokens);
    }

    parts.push(chunk);
    outputTokens += countOutputTokens(response);

    if (response.finishReason !== "length") {
      return withCombinedText(response, parts, response.finishReason, outputTokens);
    }
  }

  if (!lastResponse) {
    return { text: "", modelId: model.id, providerId: provider.id, finishReason: "error", usage: { outputTokens: 0 } };
  }
  return withCombinedText(lastResponse, parts, "length", outputTokens);
}
