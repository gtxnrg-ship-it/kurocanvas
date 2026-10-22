import { KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS, KURO_TINY_MODEL_ID } from "./localTinyModelConfig";

type ProgressEvent = { status?: string; progress?: number; file?: string; loaded?: number; total?: number };
type WorkerRequest =
  | { id: number; type: "prepare" }
  | { id: number; type: "generate"; messages: Array<{ role: string; content: string }>; maxOutputTokens: number; temperature: number };
type WorkerResponse =
  | { id: number; type: "progress"; percent: number; file?: string; status: string }
  | { id: number; type: "ready" }
  | { id: number; type: "result"; text: string; outputTokens: number; finishReason: "stop" | "length" }
  | { id: number; type: "error"; message: string };

type Runtime = {
  tokenizer: {
    apply_chat_template: (messages: Array<{ role: string; content: string }>, options: Record<string, unknown>) => unknown;
    decode: (tokens: number[], options?: Record<string, unknown>) => string;
  };
  model: { generate: (input: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }> };
};
type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<WorkerRequest>) => void) => void;
  postMessage: (message: WorkerResponse) => void;
};

const scope = globalThis as unknown as WorkerScope;
let runtimePromise: Promise<Runtime> | undefined;
let taskQueue = Promise.resolve();

async function loadRuntime(requestId: number): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      scope.postMessage({ id: requestId, type: "progress", percent: 0, status: "Preparing local runtime" });
      const { AutoTokenizer, AutoModelForCausalLM, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const progress_callback = (event: ProgressEvent) => {
        const percent = typeof event.progress === "number"
          ? Math.max(0, Math.min(100, Math.round(event.progress)))
          : event.total && event.loaded ? Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100))) : 0;
        scope.postMessage({ id: requestId, type: "progress", percent, file: event.file, status: event.status ?? "Downloading model" });
      };
      const tokenizer = await AutoTokenizer.from_pretrained(KURO_TINY_MODEL_ID, { progress_callback } as never);
      const model = await AutoModelForCausalLM.from_pretrained(KURO_TINY_MODEL_ID, {
        device: "wasm", dtype: "q4f16", progress_callback,
      } as never);
      scope.postMessage({ id: requestId, type: "progress", percent: 100, status: "Model ready" });
      return { tokenizer, model } as unknown as Runtime;
    })().catch(error => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    if (request.type === "prepare") {
      await loadRuntime(request.id);
      scope.postMessage({ id: request.id, type: "ready" });
      return;
    }
    const runtime = await loadRuntime(request.id);
    const inputs = runtime.tokenizer.apply_chat_template(request.messages, {
      tokenize: true, add_generation_prompt: true, return_dict: true, enable_thinking: false,
    }) as { input_ids?: { dims?: number[] }; [key: string]: unknown };
    const promptLength = Number(inputs.input_ids?.dims?.[1] ?? 0);
    const maxNewTokens = Math.max(16, Math.min(request.maxOutputTokens, KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS));
    const temperature = Number.isFinite(request.temperature) ? Math.max(0, Math.min(2, request.temperature)) : 0.7;
    const sampling = temperature > 0
      ? { do_sample: true, temperature, top_p: 0.8, top_k: 20 }
      : { do_sample: false };
    const output = await runtime.model.generate({ ...inputs, max_new_tokens: maxNewTokens, ...sampling });
    const tokenIds = Array.from(output.data).slice(promptLength).map(Number);
    const text = runtime.tokenizer.decode(tokenIds, { skip_special_tokens: true }).trim();
    scope.postMessage({ id: request.id, type: "result", text, outputTokens: tokenIds.length, finishReason: tokenIds.length >= maxNewTokens ? "length" : "stop" });
  } catch (error) {
    scope.postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : "Local model worker failed." });
  }
}

// Run requests sequentially. A caller cancels an active request by terminating this
// worker, which reliably stops the in-flight WASM generation rather than only hiding it.
scope.addEventListener("message", event => {
  const request = event.data;
  taskQueue = taskQueue.then(() => handleRequest(request)).catch(error => {
    scope.postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : "Local model worker failed." });
  });
});
