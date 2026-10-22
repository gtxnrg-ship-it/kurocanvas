import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";
import { KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS, KURO_TINY_MODEL_DESCRIPTOR_ID, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, KURO_TINY_MODEL_URI } from "./localTinyModelConfig";

export { KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS, KURO_TINY_MODEL_DESCRIPTOR_ID, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, KURO_TINY_MODEL_URI } from "./localTinyModelConfig";

/** Backward-compatible alias for one memory-bounded inference pass, not a whole chat reply. */
export const KURO_LOCAL_MAX_OUTPUT_TOKENS = KURO_LOCAL_MAX_OUTPUT_TOKENS_PER_PASS;
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
  private prepared = false;
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
    return Promise.resolve([{ ...MODEL, installed: this.prepared, roles: [...MODEL.roles], capabilities: [...MODEL.capabilities] }]);
  }

  /** True only when the model weights are loaded in this page's live worker. */
  isPrepared(): boolean {
    return this.prepared;
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
  }

  async prepare(signal?: AbortSignal): Promise<void> {
    const response = await this.send({ type: "prepare" }, signal);
    if (response.type !== "ready") throw new Error("The local model worker did not finish preparing.");
    this.prepared = true;
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
    if (!this.prepared) {
      throw new Error("Qwen3-0.6B has not been prepared in this session. Open Preferences and choose “Download & prepare Qwen3-0.6B”; Kuro will not download model weights from an ordinary chat message.");
    }
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
    this.prepared = false;
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
    const marker = "\n[…context section omitted…]\n";
    if (budget <= marker.length * 2 + 1) return content.slice(-budget);

    // Preserve the prompt's beginning, a central slice, and its ending. The
    // system prompt combines persona, canon, memory, research and canvas state;
    // head/tail-only clipping silently erased every middle section.
    const usable = budget - marker.length * 2;
    const head = Math.ceil(usable * 0.4);
    const middle = Math.ceil(usable * 0.2);
    const tail = usable - head - middle;
    const latestMiddleStart = Math.max(head, content.length - tail - middle);
    const middleStart = Math.max(head, Math.min(Math.floor((content.length - middle) / 2), latestMiddleStart));
    return content.slice(0, head)
      + marker
      + content.slice(middleStart, middleStart + middle)
      + marker
      + (tail ? content.slice(-tail) : "");
  };
  
  // System prompts can include the persona, the response contract, and multiple
  // project-context sections. Uniform head/middle/tail clipping often keeps
  // unrelated lore while deleting the exact character or scene the user asked about.
  // Preserve the opening contract, then spend the remaining budget on query-relevant
  // sections. The durable project records are untouched; this only selects the model's
  // bounded working window.
  const clipSystem = (content: string, budget: number, query: string): string => {
    if (content.length <= budget) return content;
    if (budget <= marker.length + 80) return clip(content, budget);

    const prefixLength = Math.min(content.length, Math.max(80, Math.floor(budget * 0.42)));
    const prefix = content.slice(0, prefixLength);
    const sections = content.slice(prefixLength).split(/\n{2,}/)
      .map((text, index) => ({ text: text.trim(), index }))
      .filter(section => section.text.length > 0);
    if (sections.length < 2) return clip(content, budget);

    const stopWords = new Set([
      "the", "and", "for", "with", "that", "this", "then", "from", "into", "your",
      "you", "are", "was", "were", "have", "has", "had", "will", "would", "could",
      "should", "can", "not", "but", "all", "any", "how", "what", "when", "where",
      "who", "why", "which", "their", "they", "them", "she", "her", "him", "his",
      "its", "about", "please", "make", "want", "need", "just", "like", "also",
      "there", "here", "because", "really", "very", "more", "some", "thing", "things",
      "does", "did", "doing", "been", "being", "get", "got", "from", "continue",
    ]);
    const tokenize = (value: string) => new Set(value.normalize("NFKC").toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(token => token.length >= 3 && !stopWords.has(token))
      .slice(0, 120));
    const queryTokens = tokenize(query);
    const ranked = sections.map(section => {
      const words = tokenize(section.text);
      let overlap = 0;
      for (const token of queryTokens) if (words.has(token)) overlap++;
      const durableContext = /\b(?:approved canon|world bible|story memory|character state|style bible|art direction|current editable canvas|research notes)\b/i.test(section.text) ? 1 : 0;
      return { ...section, score: overlap * 4 + durableContext };
    }).filter(section => section.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    // When the query doesn't overlap any labeled project context, retain the first
    // remaining section instead of silently discarding every project-specific rule.
    if (!ranked.length && sections[0]) ranked.push({ ...sections[0], score: 0 });

    const selected: Array<{ text: string; index: number }> = [];
    let used = prefix.length + marker.length;
    for (const section of ranked) {
      const separatorCost = selected.length ? marker.length : 0;
      const available = budget - used - separatorCost;
      if (available < 80) continue;
      const text = section.text.length <= available ? section.text : clip(section.text, available);
      selected.push({ text, index: section.index });
      used += separatorCost + text.length;
      if (text.length < section.text.length) break;
    }
    if (!selected.length) return clip(content, budget);
    selected.sort((a, b) => a.index - b.index);
    return prefix + marker + selected.map(section => section.text).join(marker);
  };

  // The first system block contains persona, execution rules and appended project context.
  // Preserve its beginning, central slice and ending to reduce silent context loss.
  const hasHistory = messages.some((message, index) =>
    index !== systemIndex && index !== latestUserIndex && Boolean(message.content),
  );
  const systemBudget = system && latestUser
    ? Math.floor(limit * (hasHistory ? 0.48 : 0.58))
    : system ? limit : 0;
  const boundedSystem = system ? { role: "system", content: clipSystem(system.content, systemBudget, latestUser?.content ?? "") } : undefined;
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
