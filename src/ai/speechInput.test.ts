import { describe, expect, it } from "vitest";
import {
  createBrowserSpeechRecognition,
  describeSpeechRecognitionError,
  shouldEndLiveSpeechSession,
  transcriptFromSpeechEvent,
  finalTranscriptFromSpeechEvent,
  normalizeSpokenPunctuation,
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

  it("returns only new final chunks for live hands-free turns", () => {
    const event = {
      resultIndex: 1,
      results: [
        { isFinal: true, 0: { transcript: "Older phrase" } },
        { isFinal: false, 0: { transcript: "interim word" } },
        { isFinal: true, 0: { transcript: "draw a city period" } },
      ],
    } as BrowserSpeechResultEvent;
    expect(finalTranscriptFromSpeechEvent(event)).toBe("Draw a city.");
  });

  it("turns spoken punctuation commands into readable dictation", () => {
    expect(normalizeSpokenPunctuation("Make a new character comma wearing a red coat period"))
      .toBe("Make a new character, wearing a red coat.");
    expect(normalizeSpokenPunctuation("Give her red hair exclamation mark new paragraph Make the eyes gold"))
      .toBe("Give her red hair!\n\nMake the eyes gold");
    expect(normalizeSpokenPunctuation("Say hello open quote Kuro close quote"))
      .toBe("Say hello “Kuro”");
  });

  it("capitalizes sentence starts after punctuation and line breaks, and normalizes the pronoun I", () => {
    expect(normalizeSpokenPunctuation("hello. how are you? i am okay! new line make another note"))
      .toBe("Hello. How are you? I am okay!\nMake another note");
  });

  it("does not continuously restart when microphone or recognition service errors are terminal", () => {
    for (const error of ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "network"]) {
      expect(shouldEndLiveSpeechSession(error)).toBe(true);
    }
    expect(shouldEndLiveSpeechSession("no-speech")).toBe(false);
    expect(shouldEndLiveSpeechSession("aborted")).toBe(false);
    expect(shouldEndLiveSpeechSession(undefined)).toBe(false);
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
