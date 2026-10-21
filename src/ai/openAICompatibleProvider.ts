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
  fetchImpl?: typeof fetch;
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

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.providerId?.trim() || "openai-compatible";
    this.displayName = options.displayName?.trim() || "OpenAI-compatible provider";
    this.baseUrl = normalizedBaseUrl(options.baseUrl, options.allowInsecureLocalhost === true);
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listModels(): Promise<ModelDescriptor[]> {
    const response = await this.fetchImpl(this.baseUrl + "/models", {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) throw new Error("Provider model list failed (HTTP " + response.status + ").");
    const payload = await response.json() as { data?: Array<{ id?: string; owned_by?: string }> };
    return (payload.data ?? []).filter(item => typeof item.id === "string" && item.id.length > 0).map(item => {
      const modelName = item.id!;
      const isQwen38Vision = /qwen3\\.8-27b/i.test(modelName);
      const roles = isQwen38Vision
        ? ["reasoning", "planning", "coding", "story-writing", "continuity", "research", "fast-helper"] as const
        : ["reasoning", "planning", "story-writing", "continuity", "fast-helper"] as const;
      const capabilities = isQwen38Vision
        ? ["chat", "vision", "structured-output"] as const
        : ["chat"] as const;
      const hostname = new URL(this.baseUrl).hostname;
      return {
        id: this.id + ":" + modelName,
        name: modelName,
        providerId: this.id,
        location: ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? "local" as const : "remote" as const,
        roles: [...roles],
        capabilities: [...capabilities],
        modelUri: modelName,
        installed: true,
        enabled: true,
        metadata: item.owned_by ? { ownedBy: item.owned_by } : undefined,
      };
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.baseUrl + "/models", {
        method: "GET",
        headers: this.headers(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse> {
    if (model.providerId !== this.id) throw new Error("This model belongs to a different provider.");
    if (request.signal?.aborted) {
      return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
    }
    const remoteModelName = model.modelUri || model.name;
    const body: Record<string, unknown> = {
      model: remoteModelName,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      stream: false,
    };
    if (request.responseFormat === "json") body.response_format = { type: "json_object" };

    const response = await this.fetchImpl(this.baseUrl + "/chat/completions", {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    const payload = await response.json().catch(() => ({})) as ChatCompletionPayload;
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
      finishReason: choice.finish_reason === "length" ? "length" : "stop",
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
    };
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { Authorization: "Bearer " + this.apiKey } : {};
  }
}
