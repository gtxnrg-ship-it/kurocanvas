export type KuroSpeechEngine = "kokoro" | "system";
export interface KuroSpeechPreferences { engine: KuroSpeechEngine; voice: string; rate: number; }
export interface KuroSpeechProgress { status: string; percent: number; file?: string; }
const STORAGE_KEY = "kuro-speech-preferences";
export const KURO_SPEECH_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KURO_SPEECH_MODEL_LICENSE = "Apache-2.0";
export const KURO_SPEECH_VOICES = [
  { id: "af_bella", label: "Bella · American, warm" },
  { id: "af_nicole", label: "Nicole · American, soft" },
  { id: "af_sarah", label: "Sarah · American, clear" },
  { id: "af_nova", label: "Nova · American, bright" },
  { id: "af_heart", label: "Heart · American, expressive" },
  { id: "bf_emma", label: "Emma · British, warm" },
  { id: "bf_isabella", label: "Isabella · British, soft" },
] as const;
export const DEFAULT_KURO_SPEECH_PREFERENCES: KuroSpeechPreferences = { engine: "kokoro", voice: "af_bella", rate: 1 };

export function readKuroSpeechPreferences(): KuroSpeechPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<KuroSpeechPreferences> | null;
    const engine: KuroSpeechEngine = stored?.engine === "system" ? "system" : "kokoro";
    const voice = KURO_SPEECH_VOICES.some(item => item.id === stored?.voice) ? stored!.voice! : DEFAULT_KURO_SPEECH_PREFERENCES.voice;
    const rate = typeof stored?.rate === "number" && Number.isFinite(stored.rate) ? Math.max(0.8, Math.min(1.2, stored.rate)) : 1;
    return { engine, voice, rate };
  } catch { return { ...DEFAULT_KURO_SPEECH_PREFERENCES }; }
}
export function saveKuroSpeechPreferences(value: KuroSpeechPreferences): void {
  const safe: KuroSpeechPreferences = {
    engine: value.engine === "system" ? "system" : "kokoro",
    voice: KURO_SPEECH_VOICES.some(item => item.id === value.voice) ? value.voice : DEFAULT_KURO_SPEECH_PREFERENCES.voice,
    rate: Number.isFinite(value.rate) ? Math.max(0.8, Math.min(1.2, value.rate)) : 1,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch { /* storage may be disabled */ }
}
type WorkerRequest = { id: number; type: "prepare" } | { id: number; type: "generate"; text: string; voice: string };
type WorkerReply =
  | { id: number; type: "progress"; progress: number; status: string; file?: string }
  | { id: number; type: "ready" }
  | { id: number; type: "audio"; samples: Float32Array; sampleRate: number }
  | { id: number; type: "error"; message: string };
type Pending = { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void; onProgress?: (value: KuroSpeechProgress) => void };
let speechWorker: Worker | undefined;
let nextRequestId = 1;
const pending = new Map<number, Pending>();
let playbackGeneration = 0;
let audioContext: AudioContext | undefined;
let activeSource: AudioBufferSourceNode | undefined;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error("This browser does not support local audio playback.");
    audioContext = new Constructor();
  }
  return audioContext;
}
/** Invoke directly from a tap/click to unlock playback in mobile browsers. */
export async function unlockKuroAudio(): Promise<void> {
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
}
function ensureWorker(): Worker {
  if (speechWorker) return speechWorker;
  speechWorker = new Worker(new URL("./kuroSpeech.worker.ts", import.meta.url), { type: "module", name: "kuro-local-speech" });
  speechWorker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const task = pending.get(reply.id);
    if (!task) return;
    if (reply.type === "progress") {
      task.onProgress?.({ status: reply.status, percent: reply.progress, file: reply.file });
      return;
    }
    pending.delete(reply.id);
    if (reply.type === "error") task.reject(new Error(reply.message));
    else task.resolve(reply);
  };
  speechWorker.onerror = event => {
    const error = new Error(event.message || "Kuro's local voice worker stopped unexpectedly.");
    for (const task of pending.values()) task.reject(error);
    pending.clear();
    speechWorker?.terminate();
    speechWorker = undefined;
  };
  return speechWorker;
}
function requestWorker(request: Omit<WorkerRequest, "id">, onProgress?: (value: KuroSpeechProgress) => void): Promise<WorkerReply> {
  const id = nextRequestId++;
  const instance = ensureWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    instance.postMessage({ ...request, id } as WorkerRequest);
  });
}
export async function prepareKuroVoice(onProgress?: (value: KuroSpeechProgress) => void): Promise<void> {
  const reply = await requestWorker({ type: "prepare" }, onProgress);
  if (reply.type !== "ready") throw new Error("Kuro's local voice engine did not finish preparing.");
}
function speechChunks(value: string): string[] {
  const text = value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~>#|]/g, "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (current && current.length + sentence.length + 1 > 280) { chunks.push(current); current = ""; }
    if (sentence.length > 360) {
      if (current) chunks.push(current);
      current = "";
      for (let offset = 0; offset < sentence.length; offset += 300) {
        const part = sentence.slice(offset, offset + 300).trim();
        if (part) chunks.push(part);
      }
    } else current = current ? current + " " + sentence : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}
async function playSamples(samples: Float32Array, sampleRate: number, requestGeneration: number): Promise<void> {
  if (requestGeneration !== playbackGeneration) return;
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
  if (requestGeneration !== playbackGeneration) return;
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  await new Promise<void>((resolve, reject) => {
    const source = context.createBufferSource();
    activeSource = source;
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => { if (activeSource === source) activeSource = undefined; resolve(); };
    try { source.start(); } catch (error) { reject(error); }
  });
}
function speakSystemChunk(text: string, rate: number, requestGeneration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      reject(new Error("System speech synthesis is unavailable. Choose Kokoro Local in settings."));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = 1.04;
    utterance.lang = navigator.language || "en-US";
    utterance.onend = () => resolve();
    utterance.onerror = event => {
      if (requestGeneration !== playbackGeneration || event.error === "canceled" || event.error === "interrupted") resolve();
      else reject(new Error("The device speech engine could not finish speaking."));
    };
    window.speechSynthesis.speak(utterance);
  });
}
/** Kokoro runs locally with quantized ONNX weights; synthesis text is not sent to a hosted TTS API. */
export async function speakKuroVoice(
  text: string,
  preferences: KuroSpeechPreferences = readKuroSpeechPreferences(),
  onProgress?: (value: KuroSpeechProgress) => void,
): Promise<void> {
  const chunks = speechChunks(text);
  if (!chunks.length) return;
  const requestGeneration = ++playbackGeneration;
  try {
    if (preferences.engine === "system") {
      for (const chunk of chunks) {
        if (requestGeneration !== playbackGeneration) return;
        await speakSystemChunk(chunk, preferences.rate, requestGeneration);
      }
      return;
    }
    await prepareKuroVoice(onProgress);
    for (const chunk of chunks) {
      if (requestGeneration !== playbackGeneration) return;
      const reply = await requestWorker({ type: "generate", text: chunk, voice: preferences.voice }, onProgress);
      if (requestGeneration !== playbackGeneration) return;
      if (reply.type !== "audio") throw new Error("Kuro's local voice model returned no audio.");
      await playSamples(reply.samples, reply.sampleRate, requestGeneration);
    }
  } catch (error) {
    if (requestGeneration !== playbackGeneration) return;
    throw error;
  }
}
export function stopKuroVoice(): void {
  playbackGeneration++;
  try { window.speechSynthesis?.cancel(); } catch { /* optional device voice */ }
  try { activeSource?.stop(); } catch { /* source may already have ended */ }
  activeSource = undefined;
}
export function disposeKuroVoiceWorker(): void {
  stopKuroVoice();
  speechWorker?.terminate();
  speechWorker = undefined;
  for (const task of pending.values()) task.reject(new Error("Kuro's local voice worker was stopped."));
  pending.clear();
}
