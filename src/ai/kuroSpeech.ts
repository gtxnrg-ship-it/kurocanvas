export type KuroSpeechEngine = "kokoro" | "system" | "fish";
export interface KuroSpeechPreferences { engine: KuroSpeechEngine; voice: string; rate: number; apiKey: string; }
export interface KuroSpeechProgress { status: string; percent: number; file?: string; }
export type KuroAudioActivityCallback = (level: number) => void;
import { normalizedAudioLevel } from "./audioMeter";

const STORAGE_KEY = "kuro-speech-preferences";
const API_KEY_SESSION_STORAGE_KEY = "kuro-fish-audio-api-key-session";
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
  { id: "8f5b0abbfa464c3fab065588dbfd48de", label: "Chiaki Nanami · gentle, soft-spoken, conversational", sampleUrl: "https://fish.audio/m/8f5b0abbfa464c3fab065588dbfd48de/" },
  { id: "d232d2eaced04adda979c042e1e1e34b", label: "Mitsuri Kanroji · affectionate, bright, expressive", sampleUrl: "https://fish.audio/m/d232d2eaced04adda979c042e1e1e34b/" },
] as const;
export const KURO_FISH_AUDIO_MODEL = "drama-3";
export const KURO_FISH_AUDIO_TTS_ENDPOINT = "https://api.fish.audio/v1/tts";

export interface KuroFishTtsPayload {
  text: string;
  reference_id: string;
  format: "mp3";
  language: "en";
  normalize: true;
  prosody: { speed: number; volume: 0; normalize_loudness: true };
  chunk_length: 300;
  min_chunk_length: 80;
  condition_on_previous_chunks: true;
  latency: "balanced";
}

/** Keep the same core voice while letting delivery respond gently to the meaning of the text. */
export function kuroFishPerformanceDirection(text: string): string {
  const serious = /\b(sorry|apolog(?:y|ize|ise)|that sounds painful|i'm sorry|i am sorry|grief|lost someone|overwhelmed|scared|afraid|hurt|frustrat|exhausted|worried|anxious|hard day|tough time|struggling)\b/i.test(text);
  const upbeat = /\b(hell yeah|awesome|fantastic|that worked|great news|congratulations|love this|excited|amazing|we did it|nailed it|perfect)\b/i.test(text);
  const curious = /\?\s*$/.test(text.trim()) || /\b(what if|let's explore|i'm curious|interesting question|why do you think)\b/i.test(text);
  const mood = serious
    ? "gentle, sincere and calm, with unhurried natural pauses"
    : upbeat
      ? "bright, lively and warmly expressive without sounding overexcited"
      : curious
        ? "curious, attentive and conversational, with an interested rising tone where natural"
        : "natural, warm and conversational, lightly playful when it fits";
  return "[speaking fluent English with a subtle Japanese-influenced accent; " + mood + "; natural anime voice, expressive but never exaggerated]";
}

export function buildKuroFishTtsPayload(text: string, preferences: Pick<KuroSpeechPreferences, "voice" | "rate">): KuroFishTtsPayload {
  return {
    text: kuroFishPerformanceDirection(text) + " " + text,
    reference_id: preferences.voice,
    format: "mp3",
    language: "en",
    normalize: true,
    prosody: { speed: Math.max(0.8, Math.min(1.2, preferences.rate)), volume: 0, normalize_loudness: true },
    chunk_length: 300,
    min_chunk_length: 80,
    condition_on_previous_chunks: true,
    latency: "balanced",
  };
}
export const DEFAULT_KURO_SPEECH_PREFERENCES: KuroSpeechPreferences = { engine: "fish", voice: KURO_FISH_VOICES[0].id, rate: 1, apiKey: "" };

export function readKuroSpeechPreferences(): KuroSpeechPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<KuroSpeechPreferences> | null;
    const engine: KuroSpeechEngine = stored === null
      ? DEFAULT_KURO_SPEECH_PREFERENCES.engine
      : stored.engine === "system" || stored.engine === "fish" ? stored.engine : "kokoro";
    const voiceList = engine === "fish" ? KURO_FISH_VOICES : KURO_SPEECH_VOICES;
    const fallbackVoice = engine === "fish" ? KURO_FISH_VOICES[0].id : KURO_SPEECH_VOICES[0].id;
    const voice = voiceList.some(item => item.id === stored?.voice) ? stored!.voice! : fallbackVoice;
    const rate = typeof stored?.rate === "number" && Number.isFinite(stored.rate) ? Math.max(0.8, Math.min(1.2, stored.rate)) : 1;
    // Migrate older installations away from persisting API credentials in localStorage.
    if (stored && Object.prototype.hasOwnProperty.call(stored, "apiKey")) {
      try {
        const migrated = { ...stored };
        delete migrated.apiKey;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch { /* storage may be disabled */ }
    }
    const apiKey = (() => {
      try { return (sessionStorage.getItem(API_KEY_SESSION_STORAGE_KEY) || "").trim().slice(0, 1024); }
      catch { return ""; }
    })();
    return { engine, voice, rate, apiKey };
  } catch { return { ...DEFAULT_KURO_SPEECH_PREFERENCES }; }
}
export function saveKuroSpeechPreferences(value: KuroSpeechPreferences): void {
  const safe = {
    engine: value.engine === "system" || value.engine === "fish" ? value.engine : "kokoro",
    voice: (value.engine === "fish" ? KURO_FISH_VOICES : KURO_SPEECH_VOICES).some(item => item.id === value.voice)
      ? value.voice
      : value.engine === "fish" ? KURO_FISH_VOICES[0].id : KURO_SPEECH_VOICES[0].id,
    rate: Number.isFinite(value.rate) ? Math.max(0.8, Math.min(1.2, value.rate)) : 1,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch { /* storage may be disabled */ }
  try {
    const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim().slice(0, 1024) : "";
    if (apiKey) sessionStorage.setItem(API_KEY_SESSION_STORAGE_KEY, apiKey);
    else sessionStorage.removeItem(API_KEY_SESSION_STORAGE_KEY);
  } catch { /* credentials are session-only; unavailable storage means the key must be re-entered */ }
}
type WorkerRequest = { id: number; type: "prepare" } | { id: number; type: "generate"; text: string; voice: string };
type WorkerRequestInput<T = WorkerRequest> = T extends { id: number } ? Omit<T, "id"> : never;
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
function requestWorker(request: WorkerRequestInput, onProgress?: (value: KuroSpeechProgress) => void): Promise<WorkerReply> {
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
function speechChunks(value: string, maxChunkLength = 280): string[] {
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
    if (current && current.length + sentence.length + 1 > maxChunkLength) { chunks.push(current); current = ""; }
    if (sentence.length > maxChunkLength + 80) {
      if (current) chunks.push(current);
      current = "";
      for (let offset = 0; offset < sentence.length; offset += maxChunkLength) {
        const part = sentence.slice(offset, offset + maxChunkLength).trim();
        if (part) chunks.push(part);
      }
    } else current = current ? current + " " + sentence : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}
function playAudioBuffer(
  buffer: AudioBuffer,
  rate: number,
  requestGeneration: number,
  onActivity?: KuroAudioActivityCallback,
): Promise<void> {
  if (requestGeneration !== playbackGeneration) return Promise.resolve();
  const context = getAudioContext();
  return new Promise<void>((resolve, reject) => {
    const source = context.createBufferSource();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const measure = () => {
      if (requestGeneration !== playbackGeneration) {
        onActivity?.(0);
        return;
      }
      analyser.getByteTimeDomainData(samples);
      onActivity?.(normalizedAudioLevel(samples));
      frame = requestAnimationFrame(measure);
    };
    activeSource = source;
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.8, Math.min(1.2, rate));
    source.connect(analyser);
    analyser.connect(context.destination);
    source.onended = () => {
      cancelAnimationFrame(frame);
      if (activeSource === source) activeSource = undefined;
      try { source.disconnect(); analyser.disconnect(); } catch { /* source may already be disconnected */ }
      onActivity?.(0);
      resolve();
    };
    frame = requestAnimationFrame(measure);
    try { source.start(); } catch (error) {
      cancelAnimationFrame(frame);
      try { source.disconnect(); analyser.disconnect(); } catch { /* source may not have started */ }
      reject(error);
    }
  });
}
async function playSamples(
  samples: Float32Array,
  sampleRate: number,
  rate: number,
  requestGeneration: number,
  onActivity?: KuroAudioActivityCallback,
): Promise<void> {
  if (requestGeneration !== playbackGeneration) return;
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
  if (requestGeneration !== playbackGeneration) return;
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  await playAudioBuffer(buffer, rate, requestGeneration, onActivity);
}
async function speakFishChunk(
  text: string,
  preferences: KuroSpeechPreferences,
  requestGeneration: number,
  onProgress?: (value: KuroSpeechProgress) => void,
  onActivity?: KuroAudioActivityCallback,
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
      // Drama 3 supports bracketed performance directions; the voice profile remains the
      // same while the delivery is guided toward the user's requested English accent and tone.
      body: JSON.stringify(buildKuroFishTtsPayload(text, preferences)),
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
    // Speech pace is already applied by Drama 3; change the output playback rate only if needed for local engines.
    await playAudioBuffer(buffer, 1, requestGeneration, onActivity);
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
    utterance.lang = "en-US";
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
  onActivity?: KuroAudioActivityCallback,
): Promise<void> {
  const chunks = speechChunks(text, preferences.engine === "fish" ? 900 : 280);
  if (!chunks.length) return;
  // One Kuro utterance at a time: stop stale audio and abort any previous cloud request.
  stopKuroVoice();
  const requestGeneration = playbackGeneration;
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
        await speakFishChunk(chunk, preferences, requestGeneration, onProgress, onActivity);
      }
      return;
    }
    await prepareKuroVoice(onProgress);
    for (const chunk of chunks) {
      if (requestGeneration !== playbackGeneration) return;
      const reply = await requestWorker({ type: "generate", text: chunk, voice: preferences.voice }, onProgress);
      if (requestGeneration !== playbackGeneration) return;
      if (reply.type !== "audio") throw new Error("Kuro's local voice model returned no audio.");
      await playSamples(reply.samples, reply.sampleRate, preferences.rate, requestGeneration, onActivity);
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
