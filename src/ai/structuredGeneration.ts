import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";
import { KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS } from "./localTinyModelConfig";

export interface ValidatedStructuredResponse<T> {
  response: ModelResponse;
  value: T;
  attempts: number;
}

export interface StructuredGenerationOptions {
  /** Maximum complete-output attempts. A schema retry regenerates the whole value. */
  maxAttempts?: number;
}

function validationMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "The structured output failed validation.";
}

/**
 * Produces a fully validated structured response from the local model.
 * Each local inference stays within its per-pass memory budget. If output is
 * truncated or invalid, Kuro retries by regenerating a compact, complete value;
 * it never appends raw JSON fragments or executes unvalidated model output.
 */
export async function generateValidatedStructuredResponse<T>(
  provider: ModelProvider,
  request: ModelRequest,
  model: ModelDescriptor,
  validate: (text: string) => T,
  options: StructuredGenerationOptions = {},
): Promise<ValidatedStructuredResponse<T>> {
  const maxAttempts = Math.max(1, Math.min(3, Math.floor(options.maxAttempts ?? 2)));
  let lastValidationError = "No structured response was produced.";
  let lastOutput = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (request.signal?.aborted) throw new Error("Structured generation was cancelled.");

    const messages: ModelRequest["messages"] = attempt === 1
      ? request.messages
      : [
          ...request.messages,
          {
            role: "assistant",
            content: lastOutput.slice(-6000),
          },
          {
            role: "user",
            content: [
              "REGENERATE THE STRUCTURED RESULT FROM SCRATCH.",
              "The previous output did not pass validation: " + lastValidationError,
              "Return one complete, syntactically valid JSON value matching the original schema. Do not continue or append to the previous fragment, do not add Markdown fences or commentary, and do not claim execution.",
              "Keep required keys and safety-critical fields. Make string values concise and reduce optional detail or list size only when needed to fit the output budget.",
            ].join("\n"),
          },
        ];

    const maxOutputTokens = provider.id === "kuro-local-browser"
      ? Math.min(
          KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS,
          Math.max(16, Math.floor(request.maxOutputTokens ?? KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS)),
        )
      : request.maxOutputTokens;

    let response: ModelResponse;
    try {
      response = await provider.generate({ ...request, messages, maxOutputTokens }, model);
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && /cancel/i.test(error.message))) {
        throw new Error("Structured generation was cancelled.");
      }
      if (attempt === maxAttempts) {
        throw new Error("Kuro could not generate the structured result after " + attempt + " attempt(s): " + validationMessage(error));
      }
      lastValidationError = validationMessage(error);
      lastOutput = "";
      continue;
    }

    if (request.signal?.aborted || response.finishReason === "cancelled") {
      throw new Error("Structured generation was cancelled.");
    }

    lastOutput = response.text;
    try {
      const value = validate(response.text);
      return { response, value, attempts: attempt };
    } catch (error) {
      lastValidationError = validationMessage(error);
    }
  }

  throw new Error(
    "Kuro could not produce a valid structured result after " + maxAttempts + " attempt(s): " + lastValidationError,
  );
}
