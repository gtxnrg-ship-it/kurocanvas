export type KuroSpeechEngine = "kokoro" | "system" | "fish";
export interface KuroSpeechPreferences { engine: KuroSpeechEngine; voice: string; rate: number; apiKey: string; }
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
/** Public Fish Audio community profiles chosen after listening to the user's references. */
export const KURO_FISH_VOICES = [
  { id: "84644c87811b4279940848ec184e0ffe", label: "SAKURA · bright, expressive Japanese voice style", sampleUrl: "https://fish.audio/ja/m/84644c87811b4279940848ec184e0ffe/" },
  { id: "8f5b0abbfa464c3fab065588dbfd48de", label: "Chiaki Nanami · gentle, soft-spoken, conversational", sampleUrl: "https://fish.audio/ja/m/8f5b0abbfa464c3fab065588dbfd48de/" },
  { id: "cbe13152c7ff4da98be9a95d448a1f39", label: "Mitsuri Kanroji · affectionate, bright, expressive", sampleUrl: "https://fish.audio/ja/m/cbe13152c7ff4da98be9a95d448a1f39/" },
] as const;
export const KURO_FISH_AUDIO_MODEL = "s2.1-pro-free";
export const KURO_FISH_AUDIO_TTS_ENDPOINT = "https://api.fish.audio/v1/tts";
export const DEFAULT_KURO_SPEECH_PREFERENCES: KuroSpeechPreferences = { engine: "fish", voice: KURO_FISH_VOICES[0].id, rate: 1, apiKey: "" };

export function readKuroSpeechPreferences(): KuroSpeechPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<KuroSpeechPreferences> | null;
    const engine: KuroSpeechEngine = stored?.engine === "system" || stored?.engine === "fish" ? stored.engine : "kokoro";
    const voiceList = engine === "fish" ? KURO_FISH_VOICES : KURO_SPEECH_VOICES;
    const fallbackVoice = engine === "fish" ? KURO_FISH_VOICES[0].id : DEFAULT_KURO_SPEECH_PREFERENCES.voice;
    const voice = voiceList.some(item => item.id === stored?.voice) ? stored!.voice! : fallbackVoice;
    const rate = typeof stored?.rate === "number" && Number.isFinite(stored.rate) ? Math.max(0.8, Math.min(1.2, stored.rate)) : 1;
    const apiKey = typeof stored?.apiKey === "string" ? stored.apiKey.trim().slice(0, 1024) : "";
    return { engine, voice, rate, apiKey };
  } catch { return { ...DEFAULT_KURO_SPEECH_PREFERENCES }; }
}
export function saveKuroSpeechPreferences(value: KuroSpeechPreferences): void {
  const safe: KuroSpeechPreferences = {
    engine: value.engine === "system" || value.engine === "fish" ? value.engine : "kokoro",
    voice: (value.engine === "fish" ? KURO_FISH_VOICES : KURO_SPEECH_VOICES).some(item => item.id === value.voice)
      ? value.voice
      : value.engine === "fish" ? KURO_FISH_VOICES[0].id : DEFAULT_KURO_SPEECH_PREFERENCES.voice,
    rate: Number.isFinite(value.rate) ? Math.max(0.8, Math.min(1.2, value.rate)) : 1,
    apiKey: typeof value.apiKey === "string" ? value.apiKey.trim().slice(0, 1024) : "",
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
let activeFetchController: AbortController | undefined;

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
function playAudioBuffer(buffer: AudioBuffer, rate: number, requestGeneration: number): Promise<void> {
  if (requestGeneration !== playbackGeneration) return Promise.resolve();
  const context = getAudioContext();
  return new Promise<void>((resolve, reject) => {
    const source = context.createBufferSource();
    activeSource = source;
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.8, Math.min(1.2, rate));
    source.connect(context.destination);
    source.onended = () => { if (activeSource === source) activeSource = undefined; resolve(); };
    try { source.start(); } catch (error) { reject(error); }
  });
}
async function playSamples(samples: Float32Array, sampleRate: number, rate: number, requestGeneration: number): Promise<void> {
  if (requestGeneration !== playbackGeneration) return;
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
  if (requestGeneration !== playbackGeneration) return;
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  await playAudioBuffer(buffer, rate, requestGeneration);
}
async function speakFishChunk(
  text: string,
  preferences: KuroSpeechPreferences,
  requestGeneration: number,
  onProgress?: (value: KuroSpeechProgress) => void,
): Promise<void> {
  if (!preferences.apiKey.trim()) {
    throw new Error("Fish Audio is selected, but no API key is saved. Add your own Fish Audio API key in Settings → Spoken voice.");
  }
  if (!KURO_FISH_VOICES.some(item => item.id === preferences.voice)) {
    throw new Error("Select one of the configured Fish Audio voices in Settings.");
  }
  const controller = new AbortController();
  activeFetchController = controller;
  onProgress?.({ status: "Connecting to Fish Audio for English speech", percent: 0 });
  try {
    const response = await fetch(KURO_FISH_AUDIO_TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + preferences.apiKey.trim(),
        "Content-Type": "application/json",
        model: KURO_FISH_AUDIO_MODEL,
      },
      body: JSON.stringify({ text, reference_id: preferences.voice, format: "mp3" }),
      signal: controller.signal,
    });
    if (requestGeneration !== playbackGeneration) return;
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240).replace(/\s+/g, " ").trim();
      if (response.status === 401 || response.status === 403) throw new Error("Fish Audio rejected the API key or access to this voice. Check the key and account permissions in Settings.");
      if (response.status === 429) throw new Error("Fish Audio rate limit reached. Wait a moment, then try again.");
      throw new Error("Fish Audio speech request failed (" + response.status + ")" + (detail ? ": " + detail : "."));
    }
    onProgress?.({ status: "Decoding generated speech", percent: 0 });
    const audioBytes = await response.arrayBuffer();
    if (requestGeneration !== playbackGeneration) return;
    const context = getAudioContext();
    if (context.state === "suspended") await context.resume();
    const buffer = await context.decodeAudioData(audioBytes.slice(0));
    if (requestGeneration !== playbackGeneration) return;
    onProgress?.({ status: "Speaking with the selected Fish Audio voice", percent: 100 });
    await playAudioBuffer(buffer, preferences.rate, requestGeneration);
  } catch (error) {
    if (requestGeneration !== playbackGeneration) return;
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (error instanceof TypeError) {
      throw new Error("Could not reach Fish Audio. Check the network connection; the service may also block this browser's request.");
    }
    throw error;
  } finally {
    if (activeFetchController === controller) activeFetchController = undefined;
  }
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
    if (preferences.engine === "fish") {
      for (const chunk of chunks) {
        if (requestGeneration !== playbackGeneration) return;
        await speakFishChunk(chunk, preferences, requestGeneration, onProgress);
      }
      return;
    }
    await prepareKuroVoice(onProgress);
    for (const chunk of chunks) {
      if (requestGeneration !== playbackGeneration) return;
      const reply = await requestWorker({ type: "generate", text: chunk, voice: preferences.voice }, onProgress);
      if (requestGeneration !== playbackGeneration) return;
      if (reply.type !== "audio") throw new Error("Kuro's local voice model returned no audio.");
      await playSamples(reply.samples, reply.sampleRate, preferences.rate, requestGeneration);
    }
  } catch (error) {
    if (requestGeneration !== playbackGeneration) return;
    throw error;
  }
}
export function stopKuroVoice(): void {
  playbackGeneration++;
  try { window.speechSynthesis?.cancel(); } catch { /* optional device voice */ }
  try { activeFetchController?.abort(); } catch { /* request may already have ended */ }
  activeFetchController = undefined;
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
