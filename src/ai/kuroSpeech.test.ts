import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KURO_SPEECH_PREFERENCES,
  kuroFishPerformanceDirection,
  KURO_FISH_AUDIO_MODEL,
  KURO_FISH_VOICES,
  KURO_SPEECH_VOICES,
  readKuroSpeechPreferences,
  saveKuroSpeechPreferences,
} from "./kuroSpeech";

const STORAGE_KEY = "kuro-speech-preferences";
const API_KEY_STORAGE_KEY = "kuro-fish-audio-api-key-session";

function installMemoryStorage(initial?: string, initialSessionKey?: string) {
  const values = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  if (initial !== undefined) values.set(STORAGE_KEY, initial);
  if (initialSessionKey !== undefined) sessionValues.set(API_KEY_STORAGE_KEY, initialSessionKey);
  const createStore = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  });
  vi.stubGlobal("localStorage", createStore(values));
  vi.stubGlobal("sessionStorage", createStore(sessionValues));
  return { values, sessionValues };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kuro speech preferences", () => {
  it("defaults to the SAKURA profile using Fish Audio Drama 3 without inventing a stored key", () => {
    installMemoryStorage();
    expect(readKuroSpeechPreferences().engine).toBe("fish");
    expect(DEFAULT_KURO_SPEECH_PREFERENCES.engine).toBe("fish");
    expect(DEFAULT_KURO_SPEECH_PREFERENCES.voice).toBe(KURO_FISH_VOICES[0].id);
    expect(DEFAULT_KURO_SPEECH_PREFERENCES.apiKey).toBe("");
    expect(KURO_FISH_AUDIO_MODEL).toBe("drama-3");
    expect(KURO_FISH_VOICES.map(voice => voice.id)).toEqual([
      "84644c87811b4279940848ec184e0ffe",
      "46063b8e2f754955b60c1fe78e14304f",
      "7f4b9a6850dc4a138c78b3028f4f30ed",
    ]);
  });

  it("persists voice preferences but keeps the API key in session storage only", () => {
    const { values, sessionValues } = installMemoryStorage();
    saveKuroSpeechPreferences({
      engine: "fish",
      voice: KURO_FISH_VOICES[1].id,
      rate: 2,
      apiKey: "  example-key  ",
    });
    expect(readKuroSpeechPreferences()).toEqual({
      engine: "fish",
      voice: KURO_FISH_VOICES[1].id,
      rate: 1.2,
      apiKey: "example-key",
    });
    expect(values.get(STORAGE_KEY)).not.toContain("example-key");
    expect(values.get(STORAGE_KEY)).not.toContain("apiKey");
    expect(sessionValues.get(API_KEY_STORAGE_KEY)).toBe("example-key");
  });

  it("migrates old API keys out of persistent local storage", () => {
    const legacy = JSON.stringify({ engine: "fish", voice: KURO_FISH_VOICES[0].id, rate: 1, apiKey: "legacy-key" });
    const { values } = installMemoryStorage(legacy);
    expect(readKuroSpeechPreferences().apiKey).toBe("");
    expect(values.get(STORAGE_KEY)).not.toContain("legacy-key");
    expect(values.get(STORAGE_KEY)).not.toContain("apiKey");
  });

  it("preserves older local Kokoro preferences and uses a valid local fallback voice", () => {
    installMemoryStorage(JSON.stringify({ engine: "kokoro", voice: "not-a-kokoro-voice", rate: 0.2 }));
    expect(readKuroSpeechPreferences()).toEqual({
      engine: "kokoro",
      voice: KURO_SPEECH_VOICES[0].id,
      rate: 0.8,
      apiKey: "",
    });
  });

  it("falls back to SAKURA if persisted Fish Audio state has an unknown profile", () => {
    installMemoryStorage(JSON.stringify({ engine: "fish", voice: "unknown", rate: 1, apiKey: "" }));
    expect(readKuroSpeechPreferences().voice).toBe(KURO_FISH_VOICES[0].id);
  });

  it("keeps the device-speech option valid without accepting an unknown engine", () => {
    installMemoryStorage(JSON.stringify({ engine: "system", voice: "af_nicole", rate: 1.05, apiKey: "" }));
    expect(readKuroSpeechPreferences()).toEqual({
      engine: "system",
      voice: "af_nicole",
      rate: 1.05,
      apiKey: "",
    });
    installMemoryStorage(JSON.stringify({ engine: "remote-untrusted", voice: "unknown", rate: 1, apiKey: "" }));
    expect(readKuroSpeechPreferences().engine).toBe("kokoro");
  });
});
 
describe("Kuro Fish Audio delivery direction", () => {
  it("keeps a gentle, sincere delivery for distress without dropping the accent guidance", () => {
    const direction = kuroFishPerformanceDirection("I'm sorry this has been such a hard day for you.");
    expect(direction).toContain("subtle Japanese-influenced accent");
    expect(direction).toContain("gentle, sincere and calm");
  });

  it("uses a lively but restrained delivery for excitement", () => {
    expect(kuroFishPerformanceDirection("Hell yeah, we did it!")).toContain("bright, lively");
  });

  it("sounds curious for questions and conversational by default", () => {
    expect(kuroFishPerformanceDirection("What do you think?")).toContain("curious, attentive");
    expect(kuroFishPerformanceDirection("Let's work through this together.")).toContain("natural, warm and conversational");
  });
});
