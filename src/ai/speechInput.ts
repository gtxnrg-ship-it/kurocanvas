export interface BrowserSpeechAlternative {
  transcript: string;
}

export interface BrowserSpeechResult {
  readonly isFinal: boolean;
  readonly length?: number;
  readonly 0?: BrowserSpeechAlternative;
}

export interface BrowserSpeechResultList {
  readonly length: number;
  readonly [index: number]: BrowserSpeechResult;
}

export interface BrowserSpeechResultEvent {
  readonly resultIndex: number;
  readonly results: BrowserSpeechResultList;
}

export interface BrowserSpeechErrorEvent {
  readonly error?: string;
  readonly message?: string;
}

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null;
  onerror: ((event: BrowserSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = typeof globalThis & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

/**
 * Browser speech recognition is deliberately separate from Kuro's Qwen model.
 * Support varies by browser, and browser implementations may send audio to a
 * vendor service; callers must disclose that before starting recognition.
 */
export function createBrowserSpeechRecognition(
  scope: SpeechRecognitionWindow = globalThis as SpeechRecognitionWindow,
): BrowserSpeechRecognition | undefined {
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognition) return undefined;
  try {
    return new Recognition();
  } catch {
    return undefined;
  }
}

/** Combine current recognition results without taking ownership of the draft. */
export function transcriptFromSpeechEvent(event: BrowserSpeechResultEvent): string {
  const transcript: string[] = [];
  for (let index = 0; index < event.results.length; index++) {
    const value = event.results[index]?.[0]?.transcript;
    if (typeof value === "string" && value.trim()) transcript.push(value.trim());
  }
  return transcript.join(" ").replace(/\s+/g, " ").trim();
}

export function describeSpeechRecognitionError(error: string | undefined): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Voice input was blocked by browser permissions or its speech service.";
    case "no-speech":
      return "No speech was detected. Try again or type your message.";
    case "audio-capture":
      return "The browser could not access a microphone. Check the device and app permissions.";
    case "network":
      return "The browser's speech-recognition service could not connect. Voice input may require a network connection.";
    case "language-not-supported":
      return "The browser does not support the selected recognition language.";
    case "aborted":
      return "Voice input was stopped.";
    default:
      return "Voice input could not complete. You can still type your message.";
  }
}
