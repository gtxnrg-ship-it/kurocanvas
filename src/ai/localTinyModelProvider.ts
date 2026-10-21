import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";
import { KURO_TINY_MODEL_DESCRIPTOR_ID, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, KURO_TINY_MODEL_URI } from "./localTinyModelConfig";

export { KURO_TINY_MODEL_DESCRIPTOR_ID, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, KURO_TINY_MODEL_URI } from "./localTinyModelConfig";

/** Upper bound for mobile-friendly native-tool plans and longer creative responses. */
export const KURO_LOCAL_MAX_OUTPUT_TOKENS = 1024;
type ProgressListener = (progress: { percent: number; file?: string; status: string }) => void;
type TextMessage = { role: string; content: string };
export type WorkerRequest =
  | { id: number; type: "prepare" }
  | { id: number; type: "generate"; messages: TextMessage[]; maxOutputTokens: number; temperature?: number };
type WorkerRequestPayload =
  | { type: "prepare" }
  | { type: "generate"; messages: TextMessage[]; maxOutputTokens: number; temperature?: number };
export type WorkerResponse =
  | { id: number; type: "progress"; percent: number; file?: string; status: string }
  | { id: number; type: "ready" }
  | { id: number; type: "result"; text: string; outputTokens: number; finishReason: "stop" | "length" }
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
  id: KURO_TINY_MODEL_DESCRIPTOR_ID,
  name: "Kuro Local · Qwen3-0.6B",
  providerId: "kuro-local-browser",
  location: "local",
  roles: ["reasoning", "planning", "tool-calling", "coding", "story-writing", "continuity", "research", "fast-helper"],
  capabilities: ["chat"],
  downloadBytes: KURO_TINY_MODEL_DOWNLOAD_BYTES,
  memoryBytes: 900 * 1024 * 1024,
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
  readonly displayName = "Kuro Local · Qwen3-0.6B browser model";
  private progressListener?: ProgressListener;
  private worker?: ModelWorker;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly workerFactory: () => ModelWorker = () => {
    if (typeof Worker === "undefined") throw new Error("This browser does not support Web Workers. Kuro Local will not fall back to blocking the canvas thread.");
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

  async prepare(signal?: AbortSignal): Promise<void> {
    const response = await this.send({ type: "prepare" }, signal);
    if (response.type !== "ready") throw new Error("The local model worker did not finish preparing.");
  }

  async generate(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse> {
    if (model.providerId !== this.id) throw new Error("This model belongs to a different provider.");
    if (request.signal?.aborted) return this.cancelledResponse(model);
    const messages = request.messages.map(message => {
      if (typeof message.content !== "string") {
        throw new Error("Kuro Local is text-only. Canvas-image inspection needs a vision-capable model and is not supported by this local model.");
      }
      return { role: message.role, content: message.content };
    });
    const bounded = boundMessages(messages, 12_000);
    const maxOutputTokens = Math.max(16, Math.min(request.maxOutputTokens ?? 256, KURO_LOCAL_MAX_OUTPUT_TOKENS));
    const temperature = typeof request.temperature === "number" && Number.isFinite(request.temperature)
      ? Math.max(0, Math.min(request.temperature, 1.2))
      : 0.7;
    try {
      const response = await this.send({ type: "generate", messages: bounded, maxOutputTokens, temperature }, request.signal);
      if (request.signal?.aborted) return this.cancelledResponse(model);
      if (response.type !== "result") throw new Error("The local model worker returned an unexpected response.");
      return { text: response.text, modelId: model.id, providerId: this.id, finishReason: response.finishReason, usage: { outputTokens: response.outputTokens } };
    } catch (error) {
      if (request.signal?.aborted) return this.cancelledResponse(model);
      throw error;
    }
  }

  private cancelledResponse(model: ModelDescriptor): ModelResponse {
    return { text: "", modelId: model.id, providerId: this.id, finishReason: "cancelled" };
  }

  private send(request: WorkerRequestPayload, signal?: AbortSignal): Promise<WorkerResponse> {
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

/**
 * Keep the active request present even when a long system prompt contains persona,
 * canon, research, and canvas context. The old implementation reserved the entire
 * budget for the first system message and could silently drop the actual user request.
 */
export function boundMessages(messages: TextMessage[], maxChars: number): TextMessage[] {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : 12_000;
  if (!messages.length) return [{ role: "user", content: "Hello." }];
  const systemIndex = messages[0]?.role === "system" ? 0 : -1;
  const latestUserIndex = messages.map(message => message.role).lastIndexOf("user");
  const system = systemIndex >= 0 ? messages[systemIndex] : undefined;
  const latestUser = latestUserIndex >= 0 && latestUserIndex !== systemIndex ? messages[latestUserIndex] : undefined;

  const clip = (content: string, budget: number): string => {
    if (content.length <= budget) return content;
    if (budget <= 1) return content.slice(0, budget);
    const marker = "\n[…context clipped…]\n";
    if (budget <= marker.length) return content.slice(-budget);
    const usable = budget - marker.length;
    const head = Math.ceil(usable * 0.64);
    const tail = usable - head;
    return content.slice(0, head) + marker + (tail ? content.slice(-tail) : "");
  };

  // The first system block contains the persona and execution rules. Preserve both
  // its beginning and its tail, where project context is commonly appended.
  const hasHistory = messages.some((message, index) =>
    index !== systemIndex && index !== latestUserIndex && Boolean(message.content),
  );
  const systemBudget = system && latestUser
    ? Math.floor(limit * (hasHistory ? 0.48 : 0.58))
    : system ? limit : 0;
  const boundedSystem = system ? { role: "system", content: clip(system.content, systemBudget) } : undefined;
  let used = boundedSystem?.content.length ?? 0;

  // Protect the newest user ask; leave room for recent history rather than letting
  // either the system or transcript consume every available character.
  const latestUserBudget = latestUser
    ? Math.min(
        hasHistory ? Math.max(1, Math.floor(limit * 0.36)) : Math.max(1, limit - used),
        Math.max(1, limit - used),
      )
    : 0;
  const boundedLatestUser = latestUser
    ? { ...latestUser, content: clip(latestUser.content, latestUserBudget) }
    : undefined;
  used += boundedLatestUser?.content.length ?? 0;

  const selected = new Map<number, TextMessage>();
  if (boundedSystem) selected.set(systemIndex, boundedSystem);
  if (boundedLatestUser && latestUserIndex >= 0) selected.set(latestUserIndex, boundedLatestUser);
  let remaining = Math.max(0, limit - used);
  for (let index = messages.length - 1; index >= 0 && remaining > 0; index--) {
    if (index === systemIndex || index === latestUserIndex) continue;
    const message = messages[index];
    if (!message?.content) continue;
    const content = message.content.length > remaining
      ? clip(message.content, remaining)
      : message.content;
    if (!content) continue;
    selected.set(index, { ...message, content });
    remaining -= content.length;
  }

  // Keep role chronology, including the active user request at the end.
  const bounded = [...selected.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, message]) => message);
  const total = bounded.reduce((sum, message) => sum + message.content.length, 0);
  if (total <= limit) return bounded;

  // Defensive final cap for clipping markers and very small custom budgets.
  let budget = limit;
  return bounded.map(message => {
    if (budget <= 0) return { ...message, content: "" };
    const content = message.content.slice(0, budget);
    budget -= content.length;
    return { ...message, content };
  }).filter(message => message.content.length > 0);
}
