import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
import { getKuroModelAdapter } from "./kuroModelAdapter";
import { KURO_TINY_MODEL_URI } from "./localTinyModelProvider";

export const LOCAL_TINY_BASE_URL = "local://kuro-tiny";
export const LOCAL_TINY_MODEL_URI = KURO_TINY_MODEL_URI;

export interface ProviderFactoryConfig {
  baseUrl: string;
  modelUri: string;
  apiKey?: string;
  allowInsecureLocalhost: boolean;
}

export function isLocalTinyConfig(config: Pick<ProviderFactoryConfig, "baseUrl">): boolean {
  return config.baseUrl === LOCAL_TINY_BASE_URL;
}

export function createConfiguredProvider(
  config: ProviderFactoryConfig,
  onProgress?: (progress: { percent: number; file?: string; status: string }) => void,
) {
  if (isLocalTinyConfig(config)) {
    const provider = getKuroModelAdapter();
    if ("setProgressListener" in provider && typeof provider.setProgressListener === "function") {
      provider.setProgressListener(onProgress);
    }
    return provider;
  }
  return new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    allowInsecureLocalhost: config.allowInsecureLocalhost,
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
