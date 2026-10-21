/**
 * Kuro's curated model menu. Entries are candidates with explicit runtime requirements,
 * not a claim that every listed artifact is downloadable or executable in this web build.
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
    id: "smollm2-135m-web", name: "SmolLM2 135M Instruct (Q8 ONNX)", tier: "entry",
    platforms: ["android", "ios", "tablet", "desktop", "web"], runtime: "transformers-js-web",
    downloadBytes: 137_000_000, minMemoryBytes: 350 * 1024 * 1024, modalities: ["text"],
    bestFor: "Fast lightweight chat, short rewrites, simple helper tasks",
    status: "available-in-web-build", sourceUrl: "https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct",
    notes: "Baseline candidate only. Text-only; not validated for reliable tool calls, deep reasoning, or buttery-smooth speed on every device."
  },
  {
    id: "smollm2-360m-native", name: "SmolLM2 360M Instruct (quantized)", tier: "entry",
    platforms: ["android", "ios", "tablet", "desktop"], runtime: "llama-cpp-native",
    modalities: ["text"], bestFor: "A stronger small local text model",
    status: "native-runtime-needed", sourceUrl: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct",
    notes: "Candidate for a native GGUF/runtime integration; not selectable in the current browser provider."
  },
  {
    id: "qwen3-0.6b-native", name: "Qwen3 0.6B (quantized)", tier: "entry",
    platforms: ["android", "ios", "tablet", "desktop"], runtime: "litert-lm",
    downloadBytes: 330_000_000, modalities: ["text"], bestFor: "Compact multilingual chat and lightweight reasoning",
    status: "native-runtime-needed", sourceUrl: "https://huggingface.co/litert-community/Qwen3-0.6B-int4",
    notes: "A roughly 330 MB INT4 LiteRT-LM artifact is published for mobile and web/WASM; Kuro still needs the LiteRT-LM adapter and per-device benchmark."
  },
  {
    id: "gemma3-1b-native", name: "Gemma 3 1B (quantized)", tier: "mid",
    platforms: ["android", "ios", "tablet", "desktop"], runtime: "litert-lm",
    downloadBytes: 529_000_000, modalities: ["text"], bestFor: "More capable local text tasks on supported hardware",
    status: "native-runtime-needed", sourceUrl: "https://developers.googleblog.com/google-ai-edge-small-language-models-multimodality-rag-function-calling/",
    notes: "Google AI Edge has described a 529 MB quantized variant; the exact artifact and runtime must match the target platform."
  },
  {
    id: "gemma3n-e2b-native", name: "Gemma 3n E2B (int4)", tier: "mid",
    platforms: ["android", "ios", "tablet"], runtime: "litert-lm",
    downloadBytes: 3_655_827_456, minMemoryBytes: 8 * 1024 ** 3, modalities: ["text", "image", "audio"],
    bestFor: "On-device multimodal understanding on capable phones and tablets",
    status: "native-runtime-needed", sourceUrl: "https://github.com/google-ai-edge/gallery/blob/main/model_allowlists/1_0_10.json",
    notes: "Published Android LiteRT-LM artifact is about 3.66 GB with an 8 GB device-memory requirement; far too large for entry devices."
  },
  {
    id: "gemma3n-e4b-native", name: "Gemma 3n E4B (int4)", tier: "flagship",
    platforms: ["android", "ios", "tablet"], runtime: "litert-lm",
    modalities: ["text", "image", "audio"], bestFor: "Higher-quality multimodal tasks on flagship mobile hardware",
    status: "native-runtime-needed", sourceUrl: "https://deepmind.google/models/gemma/gemma-3n/",
    notes: "Mobile-first model family, but practical package size and compatibility depend on the exact export and runtime."
  },
  {
    id: "remote-strong-model", name: "Hosted high-capability model", tier: "flagship",
    platforms: ["android", "ios", "tablet", "desktop", "web"], runtime: "remote-api",
    modalities: ["text", "image", "audio"], bestFor: "Complex planning, coding, vision, and long-context work",
    status: "remote-provider-needed", sourceUrl: "https://huggingface.co/docs/transformers.js/guides/webgpu",
    notes: "Requires a compatible configured service; network, pricing, privacy, and provider capabilities vary."
  }
] as const;
