import { describe, expect, it } from "vitest";
import {
  createBrowserSpeechRecognition,
  describeSpeechRecognitionError,
  transcriptFromSpeechEvent,
  type BrowserSpeechRecognition,
  type BrowserSpeechResultEvent,
} from "./speechInput";

describe("optional browser speech input", () => {
  it("uses the standard constructor or the WebKit-prefixed browser constructor", () => {
    let constructed = 0;
    class FakeRecognition implements BrowserSpeechRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult = null;
      onerror = null;
      onend = null;
      constructor() { constructed++; }
      start() {}
      stop() {}
    }
    const standard = createBrowserSpeechRecognition({ SpeechRecognition: FakeRecognition } as never);
    const prefixed = createBrowserSpeechRecognition({ webkitSpeechRecognition: FakeRecognition } as never);
    expect(standard).toBeInstanceOf(FakeRecognition);
    expect(prefixed).toBeInstanceOf(FakeRecognition);
    expect(constructed).toBe(2);
  });

  it("returns unavailable rather than pretending unsupported browsers can record", () => {
    expect(createBrowserSpeechRecognition({} as never)).toBeUndefined();
  });

  it("combines final and interim recognition chunks into a clean transcript", () => {
    const event = {
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: "Make a character" } },
        { isFinal: false, 0: { transcript: " with a red coat " } },
        { isFinal: true, 0: { transcript: "and black boots." } },
      ],
    } as BrowserSpeechResultEvent;
    expect(transcriptFromSpeechEvent(event)).toBe("Make a character with a red coat and black boots.");
  });

  it("returns an empty transcript for empty or non-text recognition results", () => {
    expect(transcriptFromSpeechEvent({ resultIndex: 0, results: [] })).toBe("");
    expect(transcriptFromSpeechEvent({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '   ' } }] } as BrowserSpeechResultEvent)).toBe("");
  });

  it("gives actionable explanations for common microphone and service failures", () => {
    expect(describeSpeechRecognitionError("not-allowed")).toMatch(/permissions/i);
    expect(describeSpeechRecognitionError("no-speech")).toMatch(/No speech was detected/i);
    expect(describeSpeechRecognitionError("audio-capture")).toMatch(/microphone/i);
    expect(describeSpeechRecognitionError("network")).toMatch(/network connection/i);
  });
});
