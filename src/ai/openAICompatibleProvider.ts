import type {
  ModelDescriptor,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "./modelRegistry";

export interface OpenAICompatibleProviderOptions {
  /** Base URL such as http://localhost:1234/v1 or an HTTPS API endpoint. */
  baseUrl: string;
  /** Optional bearer token. Keep secrets in memory; do not persist this value. */
  apiKey?: string;
  providerId?: string;
  displayName?: string;
  /** Only use HTTP on localhost/loopback. Remote endpoints must use HTTPS. */
  allowInsecureLocalhost?: boolean;
  /** Advertise image input only when the creator has verified the configured model supports it. */
  supportsVision?: boolean;
  /** Enable OpenAI-compatible JSON mode only when the endpoint is known to support it. */
  supportsStructuredOutput?: boolean;
  fetchImpl?: typeof fetch;
  /** Hard deadline for chat-completion requests. Defaults to 90 seconds. */
  requestTimeoutMs?: number;
  /** Hard deadline for model discovery/availability checks. Defaults to 20 seconds. */
  modelListTimeoutMs?: number;
}

type MessageContent = string | Array<{ type?: string; text?: string }> | null | undefined;

interface ChatCompletionPayload {
  choices?: Array<{
    message?: { content?: MessageContent };
    finish_reason?: string | null;
  }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function normalizedBaseUrl(raw: string, allowInsecureLocalhost: boolean): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter a valid model-provider URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowInsecureLocalhost && local && url.protocol === "http:")) {
    throw new Error("Model provider URLs must use HTTPS. HTTP is allowed only for an explicitly enabled localhost endpoint.");
  }
  if (url.username || url.password) throw new Error("Do not put credentials in the provider URL.");
  if (url.search) throw new Error("Provider URLs with query parameters are not supported. Put credentials in the session-only API key field.");
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function contentAsText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter(part => part && typeof part.text === "string").map(part => part.text).join("");
  return "";
}

/**
 * Adapter for OpenAI-compatible chat-completions endpoints.
 * It intentionally does not download models or store API credentials.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly displayName: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly modelListTimeoutMs: number;
  private readonly supportsVision: boolean;
  private readonly supportsStructuredOutput: boolean;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.providerId?.trim() || "openai-compatible";
    this.displayName = options.displayName?.trim() || "OpenAI-compatible provider";
    this.baseUrl = normalizedBaseUrl(options.baseUrl, options.allowInsecureLocalhost === true);
    this.apiKey = options.apiKey?.trim() || undefined;
    this.supportsVision = options.supportsVision === true;
    this.supportsStructuredOutput = options.supportsStructuredOutput === true;
    this.fetchImpl = options.fetchImpl ?? fetch;
    const boundedTimeout = (value: number | undefined, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.min(300_000, Math.max(1, Math.floor(value))) : fallback;
    this.requestTimeoutMs = boundedTimeout(options.requestTimeoutMs, 90_000);
    this.modelListTimeoutMs = boundedTimeout(options.modelListTimeoutMs, 20_000);
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return this.withDeadline(undefined, this.modelListTimeoutMs, async signal => {
      const response = await this.fetchImpl(this.baseUrl + "/models", {
        method: "GET",
        headers: this.headers(),
        signal,
      });
      if (!response.ok) throw new Error("Provider model list failed (HTTP " + response.status + ").");
      const payload = await response.json() as { data?: Array<{ id?: string; owned_by?: string }> };
      return (payload.data ?? []).filter(item => typeof item.id === "string" && item.id.length > 0).map(item => {
        const modelName = item.id!;
        const roles = ["reasoning", "planning", "story-writing", "continuity", "fast-helper"] as const;
        const capabilities = [
          "chat" as const,
          ...(this.supportsStructuredOutput ? ["structured-output" as const] : []),
          ...(this.supportsVision ? ["vision" as const] : []),
        ];
        const advertisedRoles = this.supportsVision ? [...roles, "vision" as const] : [...roles];
        const hostname = new URL(this.baseUrl).hostname;
        return {
          id: this.id + ":" + modelName,
          name: modelName,
          providerId: this.id,
          location: ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? "local" as const : "remote" as const,
          roles: advertisedRoles,
          capabilities: [...capabilities],
          modelUri: modelName,
          installed: true,
          enabled: true,
          metadata: item.owned_by ? { ownedBy: item.owned_by } : undefined,
        };
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.withDeadline(undefined, this.modelListTimeoutMs, signal =>
        this.fetchImpl(this.baseUrl + "/models", { method: "GET", headers: this.headers(), signal }));
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse> {
    if (model.providerId !== this.id) throw new Error("This model belongs to a different provider.");
    if (request.signal?.aborted) return this.cancelledResponse(model);
    const includesImageInput = request.messages.some(message => Array.isArray(message.content)
      && message.content.some(part => part.type === "image_url"));
    if (includesImageInput && (!this.supportsVision || !model.capabilities.includes("vision"))) {
      throw new Error("Image input is disabled for this model. Only enable vision after confirming the endpoint and selected model accept image_url content.");
    }
    const remoteModelName = model.modelUri || model.name;
    const body: Record<string, unknown> = {
      model: remoteModelName,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      stream: false,
    };
    if (request.responseFormat === "json" && this.supportsStructuredOutput) body.response_format = { type: "json_object" };

    try {
      return await this.withDeadline(request.signal, this.requestTimeoutMs, async signal => {
        const response = await this.fetchImpl(this.baseUrl + "/chat/completions", {
          method: "POST",
          headers: { ...this.headers(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
        let payload: ChatCompletionPayload;
        try { payload = await response.json() as ChatCompletionPayload; }
        catch (error) {
          if (signal.aborted) throw error;
          payload = {};
        }
        if (!response.ok) {
          const detail = typeof payload.error?.message === "string" ? payload.error.message : "HTTP " + response.status;
          throw new Error("Model request failed: " + detail);
        }
        const choice = payload.choices?.[0];
        if (!choice) throw new Error("The model provider returned no completion choices.");
        const text = contentAsText(choice.message?.content);
        return {
          text,
          modelId: model.id,
          providerId: this.id,
          finishReason: choice.finish_reason === "length" ? "length" as const : "stop" as const,
          usage: {
            inputTokens: payload.usage?.prompt_tokens,
            outputTokens: payload.usage?.completion_tokens,
          },
        };
      });
    } catch (error) {
      if (request.signal?.aborted) return this.cancelledResponse(model);
      throw error;
    }
  }

  private cancelledResponse(model: ModelDescriptor): ModelResponse {
    return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
  }

  private async withDeadline<T>(
    externalSignal: AbortSignal | undefined,
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      if (externalSignal?.aborted) throw new Error("Model request was cancelled.");
      return await operation(controller.signal);
    } catch (error) {
      if (externalSignal?.aborted) throw new Error("Model request was cancelled.");
      if (timedOut) {
        throw new Error("Model provider request timed out after " + Math.ceil(timeoutMs / 1000) + " seconds. Check the endpoint and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", forwardAbort);
    }
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { Authorization: "Bearer " + this.apiKey } : {};
  }
}
