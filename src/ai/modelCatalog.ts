/**
 * The active model catalog is intentionally a single entry.
 * Future replacement candidates belong in engineering notes until an adapter,
 * tests, and a verified runtime are shipped.
 */
export type ModelTier = "entry" | "mid" | "flagship" | "desktop";
export type ModelRuntime = "transformers-js-web" | "litert-lm" | "llama-cpp-native" | "remote-api";
export interface KuroModelOption {
  id: string;
  name: string;
  tier: ModelTier;
  platforms: Array<"android" | "ios" | "tablet" | "desktop" | "web">;
  runtime: ModelRuntime;
  downloadBytes?: number;
  minMemoryBytes?: number;
  modalities: Array<"text" | "image" | "audio">;
  bestFor: string;
  status: "available-in-web-build" | "native-runtime-needed" | "remote-provider-needed";
  sourceUrl: string;
  notes: string;
}

export const KURO_MODEL_CATALOG: readonly KuroModelOption[] = [
  {
    id: "qwen3-0.6b-web",
    name: "Qwen3-0.6B (Q4F16 ONNX)",
    tier: "entry",
    platforms: ["android", "ios", "tablet", "desktop", "web"],
    runtime: "transformers-js-web",
    downloadBytes: 370_000_000,
    minMemoryBytes: 900 * 1024 * 1024,
    modalities: ["text"],
    bestFor: "Kuro's single general-purpose local language model, strengthened by app-owned creative and tool harnesses",
    status: "available-in-web-build",
    sourceUrl: "https://huggingface.co/onnx-community/Qwen3-0.6B-DQ-ONNX",
    notes: "Text-only. Initial model download is approximately 370 MB; runtime memory is higher. A future replacement is not selectable until its runtime adapter and acceptance tests ship."
  }
] as const;
