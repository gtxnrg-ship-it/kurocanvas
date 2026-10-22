import { getKuroModelAdapter } from "./kuroModelAdapter";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
import { KURO_TINY_MODEL_URI } from "./localTinyModelProvider";

export const LOCAL_TINY_BASE_URL = "local://kuro-tiny";
export const LOCAL_TINY_MODEL_URI = KURO_TINY_MODEL_URI;

export interface ProviderFactoryConfig {
  /** local://kuro-tiny or a deliberately configured OpenAI-compatible endpoint. */
  baseUrl: string;
  modelUri: string;
  /** Used in memory for requests and not persisted by this factory. */
  apiKey?: string;
  allowInsecureLocalhost: boolean;
  supportsVision?: boolean;
  supportsStructuredOutput?: boolean;
}

export function isLocalTinyConfig(config: Pick<ProviderFactoryConfig, "baseUrl">): boolean {
  return config.baseUrl === LOCAL_TINY_BASE_URL;
}

/** True when Qwen's weights are loaded in the current browser worker session. */
export function isLocalTinyModelPrepared(): boolean {
  const provider = getKuroModelAdapter();
  return "isPrepared" in provider && typeof provider.isPrepared === "function"
    ? provider.isPrepared()
    : false;
}

/** A truthful status label for the current page's live model session. */
export function localModelReadinessLabel(): string {
  return isLocalTinyModelPrepared()
    ? "Qwen3-0.6B · prepared for this session · on-device · text-only"
    : "Qwen3-0.6B · not prepared · open Preferences for AI chat";
}

/**
 * Resolve the model adapter for Kuro's shared orchestration harnesses.
 * Local Qwen remains the default. Hosted-compatible endpoints are used only when
 * the creator explicitly configures one in Preferences; credentials stay in memory.
 */
export function createConfiguredProvider(
  config: ProviderFactoryConfig,
  onProgress?: (progress: { percent: number; file?: string; status: string }) => void,
) {
  if (isLocalTinyConfig(config)) {
    if (config.modelUri !== LOCAL_TINY_MODEL_URI) {
      throw new Error("The selected local model URI is not the supported Qwen3-0.6B runtime.");
    }
    const provider = getKuroModelAdapter();
    if ("setProgressListener" in provider && typeof provider.setProgressListener === "function") {
      provider.setProgressListener(onProgress);
    }
    return provider;
  }
  if (typeof config.modelUri !== "string" || !config.modelUri.trim() || config.modelUri.length > 512) {
    throw new Error("Choose a model ID returned by the configured endpoint before using it.");
  }
  return new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    allowInsecureLocalhost: config.allowInsecureLocalhost,
    supportsVision: config.supportsVision === true,
    supportsStructuredOutput: config.supportsStructuredOutput === true,
    providerId: "kuro-configured-compatible",
    displayName: "Configured compatible model endpoint",
  });
}

export async function prepareLocalTinyModel(
  onProgress?: (progress: { percent: number; file?: string; status: string }) => void,
  signal?: AbortSignal,
) {
  const provider = getKuroModelAdapter();
  if (!("prepare" in provider) || typeof provider.prepare !== "function") {
    throw new Error("The active Kuro model adapter does not support local model preparation.");
  }
  if ("setProgressListener" in provider && typeof provider.setProgressListener === "function") {
    provider.setProgressListener(onProgress);
  }
  await provider.prepare(signal);
  if (signal?.aborted) throw new Error("Local model preparation cancelled.");
  return provider.listModels();
}
