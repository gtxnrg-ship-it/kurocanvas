import { getKuroModelAdapter } from "./kuroModelAdapter";
import { KURO_TINY_MODEL_URI } from "./localTinyModelProvider";

export const LOCAL_TINY_BASE_URL = "local://kuro-tiny";
export const LOCAL_TINY_MODEL_URI = KURO_TINY_MODEL_URI;

export interface ProviderFactoryConfig {
  /** Retained for migration compatibility; Kuro's production adapter is local-only. */
  baseUrl: string;
  modelUri: string;
  /** Accepted only for compatibility with previously saved settings; never sent or stored. */
  apiKey?: string;
  allowInsecureLocalhost: boolean;
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

/**
 * Resolve the single model adapter used by every Kuro harness.
 * Legacy remote-provider settings intentionally fail closed rather than silently
 * routing user prompts, project canon, or creator work to a hosted endpoint.
 */
export function createConfiguredProvider(
  config: ProviderFactoryConfig,
  onProgress?: (progress: { percent: number; file?: string; status: string }) => void,
) {
  if (!isLocalTinyConfig(config) || config.modelUri !== LOCAL_TINY_MODEL_URI) {
    throw new Error("Kuro currently uses only on-device Qwen3-0.6B. Reopen Preferences to migrate the saved model settings.");
  }
  const provider = getKuroModelAdapter();
  if ("setProgressListener" in provider && typeof provider.setProgressListener === "function") {
    provider.setProgressListener(onProgress);
  }
  return provider;
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
