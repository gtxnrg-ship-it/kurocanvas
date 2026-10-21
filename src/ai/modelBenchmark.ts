export type LocalBenchmarkRating = "fast" | "usable" | "slow" | "inconclusive";
export interface LocalModelBenchmark {
  schemaVersion: 1;
  modelId: string;
  outputTokens: number;
  elapsedMs: number;
  tokensPerSecond: number;
  rating: LocalBenchmarkRating;
  measuredAt: string;
}

export const LOCAL_MODEL_BENCHMARK_KEY = "kuro-local-model-benchmark:v1";
const MAX_BENCHMARK_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Measures warm, text-only generation speed; it is not a full app or drawing-quality score. */
export function createLocalModelBenchmark(
  modelId: string,
  outputTokens: number,
  elapsedMs: number,
  measuredAt = new Date().toISOString(),
): LocalModelBenchmark {
  if (!modelId.trim()) throw new Error("A benchmark needs a model ID.");
  if (!Number.isSafeInteger(outputTokens) || outputTokens < 0) throw new Error("Benchmark output tokens must be a non-negative integer.");
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) throw new Error("Benchmark duration must be a positive finite number.");
  if (!Number.isFinite(Date.parse(measuredAt))) throw new Error("Benchmark timestamp must be a valid date.");
  const tokensPerSecond = outputTokens / (elapsedMs / 1000);
  const rating: LocalBenchmarkRating = outputTokens < 8 ? "inconclusive" :
    tokensPerSecond >= 12 ? "fast" : tokensPerSecond >= 4 ? "usable" : "slow";
  return { schemaVersion: 1, modelId, outputTokens, elapsedMs: Math.round(elapsedMs), tokensPerSecond, rating, measuredAt };
}

export function validateLocalModelBenchmark(value: unknown, now = Date.now()): value is LocalModelBenchmark {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<LocalModelBenchmark>;
  if (v.schemaVersion !== 1 || typeof v.modelId !== "string" || !v.modelId.trim()
    || !Number.isSafeInteger(v.outputTokens) || (v.outputTokens as number) < 0
    || !Number.isFinite(v.elapsedMs) || (v.elapsedMs as number) <= 0
    || !Number.isFinite(v.tokensPerSecond) || (v.tokensPerSecond as number) < 0
    || !["fast", "usable", "slow", "inconclusive"].includes(String(v.rating))
    || typeof v.measuredAt !== "string" || !Number.isFinite(Date.parse(v.measuredAt))) return false;
  const age = now - Date.parse(v.measuredAt);
  if (age < -5 * 60 * 1000 || age > MAX_BENCHMARK_AGE_MS) return false;
  const expected = createLocalModelBenchmark(v.modelId, v.outputTokens as number, v.elapsedMs as number, v.measuredAt);
  return Math.abs(expected.tokensPerSecond - (v.tokensPerSecond as number)) < 0.01 && expected.rating === v.rating;
}

/** Storage stays local to this browser and is never sent with model requests. */
export function saveLocalModelBenchmark(value: LocalModelBenchmark): void {
  if (!validateLocalModelBenchmark(value)) throw new Error("Refusing to store an invalid or stale model benchmark.");
  try { localStorage.setItem(LOCAL_MODEL_BENCHMARK_KEY, JSON.stringify(value)); }
  catch { /* Benchmark remains usable in current memory when browser storage is unavailable. */ }
}

export function loadLocalModelBenchmark(modelId: string, now = Date.now()): LocalModelBenchmark | undefined {
  try {
    const raw = localStorage.getItem(LOCAL_MODEL_BENCHMARK_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!validateLocalModelBenchmark(parsed, now) || parsed.modelId !== modelId) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function localBenchmarkRatingLabel(rating: LocalBenchmarkRating): string {
  switch (rating) {
    case "fast": return "Fast local text generation";
    case "usable": return "Usable, but slower";
    case "slow": return "Slow for repeated local chat";
    case "inconclusive": return "Inconclusive · too few output tokens";
  }
}
