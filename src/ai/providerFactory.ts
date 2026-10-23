import { getKuroModelAdapter } from "./kuroModelAdapter";
import { KURO_TINY_MODEL_URI } from "./localTinyModelProvider";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider";

export const LOCAL_TINY_BASE_URL = "local://kuro-tiny";
export const LOCAL_TINY_MODEL_URI = KURO_TINY_MODEL_URI;

export interface ProviderFactoryConfig {
  /** The local sentinel URL or an explicitly configured OpenAI-compatible endpoint. */
  baseUrl: string;
  modelUri: string;
  /** The external endpoint bearer token; callers must keep it out of localStorage and packages. */
  apiKey?: string;
  allowInsecureLocalhost: boolean;
  supportsVision?: boolean;
  /** Must be explicitly true before project context can be sent to an external endpoint. */
  allowRemoteData?: boolean;
}

export function isLocalTinyConfig(config: Pick<ProviderFactoryConfig, "baseUrl">): boolean {
  return config.baseUrl === LOCAL_TINY_BASE_URL;
}

export function isExternalProviderConfig(config: Pick<ProviderFactoryConfig, "baseUrl">): boolean {
  return !isLocalTinyConfig(config);
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

export function providerReadinessLabel(config?: Pick<ProviderFactoryConfig, "baseUrl" | "allowRemoteData" | "supportsVision"> | null): string {
  if (config && isExternalProviderConfig(config) && config.allowRemoteData === true) {
    return "External model · project context goes to the configured endpoint"
      + (config.supportsVision === true ? " · image input enabled" : " · text-only");
  }
  return localModelReadinessLabel();
}

/**
 * Resolve a provider only from an explicit configuration. Local Qwen remains the default.
 * An external OpenAI-compatible endpoint is never selected without explicit remote-data consent.
 */
export function createConfiguredProvider(
  config: ProviderFactoryConfig,
  onProgress?: (progress: { percent: number; file?: string; status: string }) => void,
) {
  if (isLocalTinyConfig(config)) {
    if (config.modelUri !== LOCAL_TINY_MODEL_URI) {
      throw new Error("Kuro's local provider is Qwen3-0.6B only. Reopen Preferences to correct the saved model settings.");
    }
    const provider = getKuroModelAdapter();
    if ("setProgressListener" in provider && typeof provider.setProgressListener === "function") {
      provider.setProgressListener(onProgress);
    }
    return provider;
  }

  if (config.allowRemoteData !== true) {
    throw new Error("External model use is disabled until you explicitly consent to sending project context to that endpoint.");
  }
  const modelUri = config.modelUri.trim();
  if (!modelUri) throw new Error("Choose a model ID from the external provider before connecting.");
  return new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    modelUri,
    apiKey: config.apiKey,
    allowInsecureLocalhost: config.allowInsecureLocalhost,
    supportsVision: config.supportsVision === true,
    providerId: "openai-compatible",
    displayName: "OpenAI-compatible model provider",
  });
}

/** Prepare only the bundled local model; remote providers never trigger a surprise model download. */
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
