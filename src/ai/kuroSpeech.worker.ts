const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
type ProgressEvent = { status?: string; progress?: number; file?: string; loaded?: number; total?: number };
type Request = { id: number; type: "prepare" } | { id: number; type: "generate"; text: string; voice: string };
type Reply =
  | { id: number; type: "progress"; progress: number; status: string; file?: string }
  | { id: number; type: "ready" }
  | { id: number; type: "audio"; samples: Float32Array; sampleRate: number }
  | { id: number; type: "error"; message: string };
type SpeechPipeline = (text: string, options?: Record<string, unknown>) => Promise<{ audio: Float32Array | ArrayLike<number>; sampling_rate?: number }>;
const scope = globalThis as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<Request>) => void) => void;
  postMessage: (message: Reply, transfer?: Transferable[]) => void;
};
let pipelinePromise: Promise<SpeechPipeline> | undefined;
let taskQueue = Promise.resolve();
function progressFor(id: number) {
  return (event: ProgressEvent) => {
    const progress = typeof event.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(event.progress)))
      : event.total && event.loaded
        ? Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100)))
        : 0;
    scope.postMessage({ id, type: "progress", progress, status: event.status ?? "Preparing local speech model", file: event.file });
  };
}
async function getPipeline(id: number): Promise<SpeechPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      scope.postMessage({ id, type: "progress", progress: 0, status: "Starting local Kokoro voice engine" });
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const createPipeline = pipeline as unknown as (
        task: string, model: string, options?: Record<string, unknown>
      ) => Promise<SpeechPipeline>;
      return createPipeline("text-to-speech", MODEL_ID, {
        dtype: "q8", device: "wasm", progress_callback: progressFor(id),
      });
    })().catch(error => { pipelinePromise = undefined; throw error; });
  }
  return pipelinePromise;
}
async function handle(request: Request): Promise<void> {
  try {
    const tts = await getPipeline(request.id);
    if (request.type === "prepare") { scope.postMessage({ id: request.id, type: "ready" }); return; }
    const generated = await tts(request.text, { speaker_id: request.voice });
    const source = generated.audio;
    const samples = source instanceof Float32Array ? source.slice() : Float32Array.from(source);
    scope.postMessage({ id: request.id, type: "audio", samples, sampleRate: typeof generated.sampling_rate === "number" ? generated.sampling_rate : 24000 }, [samples.buffer]);
  } catch (error) {
    scope.postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : "Kuro's local voice worker failed." });
  }
}
scope.addEventListener("message", event => {
  const request = event.data;
  taskQueue = taskQueue.then(() => handle(request)).catch(error => {
    scope.postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : "Kuro's local voice worker failed." });
  });
});
