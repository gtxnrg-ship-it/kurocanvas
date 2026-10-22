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
  return normalizeSpokenPunctuation(transcript.join(" ").replace(/\s+/g, " ").trim());
}

/**
 * Return only final phrases changed in this recognition event. Live voice mode
 * never submits interim hypotheses, preventing Kuro from replying multiple times.
 */
export function finalTranscriptFromSpeechEvent(event: BrowserSpeechResultEvent): string {
  const parts: string[] = [];
  const start = Math.max(0, Math.min(event.resultIndex, event.results.length));
  for (let index = start; index < event.results.length; index++) {
    const result = event.results[index];
    const value = result?.isFinal ? result[0]?.transcript : undefined;
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  return normalizeSpokenPunctuation(parts.join(" ").replace(/\s+/g, " ").trim());
}

/**
 * Normalize common dictation commands when a browser literally transcribes the
 * spoken punctuation words. Native speech services may already emit punctuation;
 * this pass preserves existing punctuation and only translates explicit commands.
 */
export function normalizeSpokenPunctuation(value: string): string {
  let text = value.trim();
  const replacements: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bnew paragraph\b[,.!?;:]?/gi, "\n\n"],
    [/\bnew line\b[,.!?;:]?/gi, "\n"],
    [/\bquestion mark\b[,.!?;:]?/gi, "?"],
    [/\bexclamation mark\b[,.!?;:]?/gi, "!"],
    [/\b(?:full stop|period)\b[,.!?;:]?/gi, "."],
    [/\bcomma\b[,.!?;:]?/gi, ","],
    [/\bsemicolon\b[,.!?;:]?/gi, ";"],
    [/\bcolon\b[,.!?;:]?/gi, ":"],
    [/\bellipsis\b[,.!?;:]?/gi, "…"],
    [/\bopen quote\b/gi, "“"],
    [/\bclose quote\b/gi, "”"],
  ];
  for (const [pattern, punctuation] of replacements) text = text.replace(pattern, punctuation);
  // Tidy spacing around punctuation without flattening deliberate new paragraphs.
  text = text
    .replace(/[ \t]+([,.;:!?…])/g, "$1")
    .replace(/([,;:!?…])(?=\S)/g, "$1 ")
    .replace(/\.([A-Za-z“])/g, ". $1")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/“[ \t]+/g, "“")
    .replace(/[ \t]+”/g, "”")
    .replace(/(^|[.!?]\\s+|\\n\\s*)([a-z])/g, (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase())
    .replace(/(^|\\s)i(?=\\s|$|[,.!?])/g, (_match, prefix: string) => prefix + "I")
    .trim();
  return text;
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
