import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";

export const KURO_TINY_MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
export const KURO_TINY_MODEL_URI = "kuro-local-smollm2-135m";
export const KURO_TINY_MODEL_DOWNLOAD_BYTES = 137_000_000;

type ProgressEvent = { status?: string; progress?: number; file?: string; loaded?: number; total?: number };
type ProgressListener = (progress: { percent: number; file?: string; status: string }) => void;
type Runtime = {
  tokenizer: {
    apply_chat_template: (messages: Array<{ role: string; content: string }>, options: Record<string, unknown>) => unknown;
    decode: (tokens: number[], options?: Record<string, unknown>) => string;
  };
  model: { generate: (input: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }> };
};

const MODEL: ModelDescriptor = {
  id: "kuro-local:smollm2-135m-instruct",
  name: "Kuro Tiny · SmolLM2 135M Instruct",
  providerId: "kuro-local-browser",
  location: "local",
  roles: ["reasoning", "planning", "tool-calling", "coding", "story-writing", "continuity", "research", "fast-helper"],
  capabilities: ["chat", "structured-output"],
  downloadBytes: KURO_TINY_MODEL_DOWNLOAD_BYTES,
  memoryBytes: 350 * 1024 * 1024,
  license: "Apache-2.0",
  modelUri: KURO_TINY_MODEL_URI,
  installed: true,
  enabled: true,
  metadata: { runtime: "Transformers.js / ONNX Runtime Web", modelId: KURO_TINY_MODEL_ID, vision: false },
};

/**
 * Browser-local model provider. The weights are fetched only when the user explicitly
 * prepares the model or makes a first request, then cached by Transformers.js in the
 * browser cache. This model is text-only; image parts are rejected rather than ignored.
 */
export class LocalTinyModelProvider implements ModelProvider {
  readonly id = "kuro-local-browser";
  readonly displayName = "Kuro Tiny · On-device browser model";
  private static runtimePromise: Promise<Runtime> | undefined;
  private progressListener?: ProgressListener;

  setProgressListener(listener?: ProgressListener): void {
    this.progressListener = listener;
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([{ ...MODEL, roles: [...MODEL.roles], capabilities: [...MODEL.capabilities] }]);
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
  }

  async prepare(): Promise<void> {
    await this.getRuntime();
  }

  async generate(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse> {
    if (model.providerId !== this.id) throw new Error("This model belongs to a different provider.");
    if (request.signal?.aborted) {
      return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
    }
    const messages = request.messages.map((message) => {
      if (typeof message.content !== "string") {
        throw new Error("Kuro Tiny is text-only. Canvas-image inspection needs a vision-capable model and is not supported by this local model.");
      }
      return { role: message.role, content: message.content };
    });
    const bounded = boundMessages(messages, 12_000);
    const runtime = await this.getRuntime();
    if (request.signal?.aborted) {
      return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
    }
    const inputs = runtime.tokenizer.apply_chat_template(bounded, {
      tokenize: true,
      add_generation_prompt: true,
      return_dict: true,
    }) as { input_ids?: { dims?: number[] }; [key: string]: unknown };
    const promptLength = Number(inputs.input_ids?.dims?.[1] ?? 0);
    const maxNewTokens = Math.max(16, Math.min(request.maxOutputTokens ?? 256, 512));
    const output = await runtime.model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: false,
    });
    if (request.signal?.aborted) {
      return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
    }
    const tokenIds = Array.from(output.data).slice(promptLength).map(Number);
    const text = runtime.tokenizer.decode(tokenIds, { skip_special_tokens: true }).trim();
    return {
      text,
      modelId: model.id,
      providerId: this.id,
      finishReason: tokenIds.length >= maxNewTokens ? "length" : "stop",
    };
  }

  private async getRuntime(): Promise<Runtime> {
    if (!LocalTinyModelProvider.runtimePromise) {
      LocalTinyModelProvider.runtimePromise = (async () => {
        this.emit({ status: "Preparing local runtime", progress: 0 });
        const { AutoTokenizer, AutoModelForCausalLM, env } = await import("@huggingface/transformers");
        // Keep downloaded weights in the browser-managed cache; never persist user prompts or API keys.
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        const progress_callback = (event: ProgressEvent) => {
          const percent = typeof event.progress === "number"
            ? Math.max(0, Math.min(100, Math.round(event.progress)))
            : event.total && event.loaded ? Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100))) : 0;
          this.emit({ percent, file: event.file, status: event.status ?? "Downloading model" });
        };
        const tokenizer = await AutoTokenizer.from_pretrained(KURO_TINY_MODEL_ID, { progress_callback } as never);
        const model = await AutoModelForCausalLM.from_pretrained(KURO_TINY_MODEL_ID, {
          device: "wasm",
          progress_callback,
        } as never);
        this.emit({ status: "Model ready", progress: 100 });
        return { tokenizer, model } as unknown as Runtime;
      })().catch((error) => {
        LocalTinyModelProvider.runtimePromise = undefined;
        throw error;
      });
    }
    return LocalTinyModelProvider.runtimePromise;
  }

  private emit(progress: { status: string; progress?: number; percent?: number; file?: string }): void {
    this.progressListener?.({
      percent: progress.percent ?? progress.progress ?? 0,
      file: progress.file,
      status: progress.status,
    });
  }
}

function boundMessages(messages: Array<{ role: string; content: string }>, maxChars: number): Array<{ role: string; content: string }> {
  if (!messages.length) return [{ role: "user", content: "Hello." }];
  const first = messages[0]?.role === "system" ? messages[0] : undefined;
  const rest = messages.slice(first ? 1 : 0);
  let remaining = maxChars - (first?.content.length ?? 0);
  const selected: Array<{ role: string; content: string }> = [];
  for (let i = rest.length - 1; i >= 0 && remaining > 0; i--) {
    const message = rest[i];
    const content = message.content.length > remaining ? message.content.slice(-remaining) : message.content;
    selected.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  return [...(first ? [{ role: first.role, content: first.content.slice(0, Math.max(0, maxChars - selected.reduce((n, m) => n + m.content.length, 0))) }] : []), ...selected];
}
