import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KURO_SPEECH_PREFERENCES,
  KURO_FISH_AUDIO_MODEL,
  KURO_FISH_VOICES,
  KURO_SPEECH_VOICES,
  readKuroSpeechPreferences,
  saveKuroSpeechPreferences,
} from "./kuroSpeech";

const STORAGE_KEY = "kuro-speech-preferences";

function installMemoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STORAGE_KEY, initial);
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal("localStorage", store);
  return { store, values };
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

  it("persists a chosen Fish Audio profile, clamps the rate, and trims the API key", () => {
    installMemoryStorage();
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
