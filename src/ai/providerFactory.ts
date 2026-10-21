import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
import { LocalTinyModelProvider, KURO_TINY_MODEL_URI } from "./localTinyModelProvider";

export const LOCAL_TINY_BASE_URL = "local://kuro-tiny";
export const LOCAL_TINY_MODEL_URI = KURO_TINY_MODEL_URI;

export interface ProviderFactoryConfig {
  baseUrl: string;
  modelUri: string;
  apiKey?: string;
  allowInsecureLocalhost: boolean;
}

const localTinyProvider = new LocalTinyModelProvider();

export function isLocalTinyConfig(config: Pick<ProviderFactoryConfig, "baseUrl">): boolean {
  return config.baseUrl === LOCAL_TINY_BASE_URL;
}

export function createConfiguredProvider(
  config: ProviderFactoryConfig,
  onProgress?: (progress: { percent: number; file?: string; status: string }) => void,
) {
  if (isLocalTinyConfig(config)) {
    localTinyProvider.setProgressListener(onProgress);
    return localTinyProvider;
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
  localTinyProvider.setProgressListener(onProgress);
  await localTinyProvider.prepare(signal);
  if (signal?.aborted) throw new Error("Local model preparation cancelled.");
  return localTinyProvider.listModels();
}
