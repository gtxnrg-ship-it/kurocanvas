/**
 * Recover a single JSON value from model output that may include a Markdown
 * fence or brief leading/trailing commentary. This is only a syntax-recovery
 * helper: callers must still validate the parsed value against their own schema
 * and must never execute model-provided strings as code.
 */
const DEFAULT_MAX_CHARS = 512 * 1024;
const MAX_CANDIDATE_STARTS = 128;

function tryParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function findBalancedJson<T>(text: string, maxChars: number): T | undefined {
  let candidates = 0;
  for (let start = 0; start < text.length && candidates < MAX_CANDIDATE_STARTS; start++) {
    const opening = text[start];
    if (opening !== "{" && opening !== "[") continue;
    candidates++;
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{" || char === "[") {
        stack.push(char === "{" ? "}" : "]");
        continue;
      }
      if (char === "}" || char === "]") {
        if (stack.pop() !== char) break;
        if (stack.length === 0) {
          const candidate = text.slice(start, index + 1);
          if (candidate.length <= maxChars) {
            const parsed = tryParse<T>(candidate);
            if (parsed !== undefined) return parsed;
          }
          break;
        }
      }
      if (index - start >= maxChars) break;
    }
  }
  return undefined;
}

export function parseModelJson<T = unknown>(raw: string, maxChars = DEFAULT_MAX_CHARS): T {
  if (typeof raw !== "string") throw new Error("Model output must be text.");
  if (!Number.isFinite(maxChars) || maxChars < 1) throw new Error("The JSON response-size limit must be positive.");
  if (raw.length > maxChars) throw new Error("The model's structured response exceeds the size limit.");
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("The model returned an empty structured response.");

  const direct = tryParse<T>(text);
  if (direct !== undefined) return direct;

  // Prefer an explicitly fenced JSON value before recovering a value from prose.
  const fences = /\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/gi;
  let fence: RegExpExecArray | null;
  while ((fence = fences.exec(text)) !== null) {
    const value = tryParse<T>(fence[1].trim());
    if (value !== undefined) return value;
  }

  const recovered = findBalancedJson<T>(text, maxChars);
  if (recovered !== undefined) return recovered;
  throw new Error("The model did not return a recoverable JSON value.");
}
