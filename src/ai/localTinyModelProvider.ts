import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";
import { KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, KURO_TINY_MODEL_URI } from "./localTinyModelConfig";

export { KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, KURO_TINY_MODEL_URI } from "./localTinyModelConfig";
type ProgressListener = (progress: { percent: number; file?: string; status: string }) => void;
type TextMessage = { role: string; content: string };
export type WorkerRequest =
  | { id: number; type: "prepare" }
  | { id: number; type: "generate"; messages: TextMessage[]; maxOutputTokens: number };
export type WorkerResponse =
  | { id: number; type: "progress"; percent: number; file?: string; status: string }
  | { id: number; type: "ready" }
  | { id: number; type: "result"; text: string; finishReason: "stop" | "length" }
  | { id: number; type: "error"; message: string };
export type ModelWorker = {
  postMessage: (message: WorkerRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type PendingRequest = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
};

const MODEL: ModelDescriptor = {
  id: "kuro-local:smollm2-135m-instruct",
  name: "Kuro Tiny · SmolLM2 135M Instruct",
  providerId: "kuro-local-browser",
  location: "local",
  roles: ["fast-helper"],
  capabilities: ["chat"],
  downloadBytes: KURO_TINY_MODEL_DOWNLOAD_BYTES,
  memoryBytes: 350 * 1024 * 1024,
  license: "Apache-2.0",
  modelUri: KURO_TINY_MODEL_URI,
  installed: true,
  enabled: true,
  metadata: { runtime: "Transformers.js / ONNX Runtime Web (worker)", modelId: KURO_TINY_MODEL_ID, vision: false },
};

/**
 * Browser-local model provider. Inference runs in a dedicated worker so WASM generation
 * does not block canvas input, animation, or chat navigation. Cancelling terminates the
 * active worker, stopping the computation rather than merely discarding its result.
 */
export class LocalTinyModelProvider implements ModelProvider {
  readonly id = "kuro-local-browser";
  readonly displayName = "Kuro Tiny · On-device browser model";
  private progressListener?: ProgressListener;
  private worker?: ModelWorker;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly workerFactory: () => ModelWorker = () => {
    if (typeof Worker === "undefined") throw new Error("This browser does not support Web Workers. Kuro Tiny will not fall back to blocking the canvas thread.");
    return new Worker(new URL("./localTinyModel.worker.ts", import.meta.url), { type: "module" }) as unknown as ModelWorker;
  }) {}

  setProgressListener(listener?: ProgressListener): void {
    this.progressListener = listener;
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([{ ...MODEL, roles: [...MODEL.roles], capabilities: [...MODEL.capabilities] }]);
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
  }

  async prepare(): Promise<void> {
    const response = await this.send({ type: "prepare" });
    if (response.type !== "ready") throw new Error("The local model worker did not finish preparing.");
  }

  async generate(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse> {
    if (model.providerId !== this.id) throw new Error("This model belongs to a different provider.");
    if (request.signal?.aborted) return this.cancelledResponse(model);
    const messages = request.messages.map(message => {
      if (typeof message.content !== "string") {
        throw new Error("Kuro Tiny is text-only. Canvas-image inspection needs a vision-capable model and is not supported by this local model.");
      }
      return { role: message.role, content: message.content };
    });
    const bounded = boundMessages(messages, 12_000);
    const maxOutputTokens = Math.max(16, Math.min(request.maxOutputTokens ?? 256, 512));
    try {
      const response = await this.send({ type: "generate", messages: bounded, maxOutputTokens }, request.signal);
      if (request.signal?.aborted) return this.cancelledResponse(model);
      if (response.type !== "result") throw new Error("The local model worker returned an unexpected response.");
      return { text: response.text, modelId: model.id, providerId: this.id, finishReason: response.finishReason };
    } catch (error) {
      if (request.signal?.aborted) return this.cancelledResponse(model);
      throw error;
    }
  }

  private cancelledResponse(model: ModelDescriptor): ModelResponse {
    return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
  }

  private send(request: Omit<WorkerRequest, "id">, signal?: AbortSignal): Promise<WorkerResponse> {
    if (signal?.aborted) return Promise.reject(new Error("Local model request cancelled."));
    return new Promise<WorkerResponse>((resolve, reject) => {
      const id = this.nextRequestId++;
      let worker: ModelWorker;
      try { worker = this.getWorker(); }
      catch (error) { reject(error instanceof Error ? error : new Error("Could not start the local model worker.")); return; }
      const abortHandler = signal ? () => {
        this.stopWorker(new Error("The local model worker was stopped to cancel inference."), id);
      } : undefined;
      this.pending.set(id, { resolve, reject, signal, abortHandler });
      if (signal && abortHandler) signal.addEventListener("abort", abortHandler, { once: true });
      try {
        worker.postMessage({ ...request, id } as WorkerRequest);
      } catch (error) {
        this.finishRequest(id);
        reject(error instanceof Error ? error : new Error("Could not send the request to the local model worker."));
      }
    });
  }

  private getWorker(): ModelWorker {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = event => {
      const response = event.data;
      if (response.type === "progress") {
        this.progressListener?.({ percent: response.percent, file: response.file, status: response.status });
        return;
      }
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.finishRequest(response.id);
      if (response.type === "error") pending.reject(new Error(response.message));
      else pending.resolve(response);
    };
    worker.onerror = event => this.stopWorker(new Error(event.message || "The local model worker crashed."));
    this.worker = worker;
    return worker;
  }

  private finishRequest(id: number): void {
    const pending = this.pending.get(id);
    if (pending?.signal && pending.abortHandler) pending.signal.removeEventListener("abort", pending.abortHandler);
    this.pending.delete(id);
  }

  private stopWorker(reason: Error, cancelledRequestId?: number): void {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    for (const [id, pending] of this.pending) {
      if (pending.signal && pending.abortHandler) pending.signal.removeEventListener("abort", pending.abortHandler);
      this.pending.delete(id);
      if (id === cancelledRequestId || pending.signal?.aborted) pending.reject(new Error("Local model request cancelled."));
      else pending.reject(reason);
    }
  }
}

/** Keep the system message and most recent content inside the small model's context budget. */
export function boundMessages(messages: TextMessage[], maxChars: number): TextMessage[] {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : 12_000;
  if (!messages.length) return [{ role: "user", content: "Hello." }];
  const first = messages[0]?.role === "system" ? messages[0] : undefined;
  const rest = messages.slice(first ? 1 : 0);
  let remaining = Math.max(0, limit - (first?.content.length ?? 0));
  const selected: TextMessage[] = [];
  for (let i = rest.length - 1; i >= 0 && remaining > 0; i--) {
    const message = rest[i];
    const content = message.content.length > remaining ? message.content.slice(-remaining) : message.content;
    selected.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  const system = first ? [{ role: first.role, content: first.content.slice(0, Math.max(0, limit - selected.reduce((n, message) => n + message.content.length, 0))) }] : [];
  return [...system, ...selected];
}
