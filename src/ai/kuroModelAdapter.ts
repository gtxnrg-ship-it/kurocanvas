import { LocalTinyModelProvider } from "./localTinyModelProvider";
import type { ModelProvider } from "./modelRegistry";

/**
 * The single model-runtime seam for Kuro's agent harnesses.
 *
 * Agent orchestration should depend on ModelProvider, never on a model name,
 * model file, Transformers.js session, or provider-specific request format.
 * Today this returns the on-device Qwen3-0.6B runtime. To upgrade Kuro later,
 * implement ModelProvider for the replacement runtime and change this factory;
 * memory, drawing tools, research tools, and workflow harnesses should remain
 * untouched.
 */
export type KuroModelAdapter = ModelProvider;

let activeAdapter: KuroModelAdapter | undefined;

/** Returns Kuro's one configured model adapter, shared across the app. */
export function getKuroModelAdapter(): KuroModelAdapter {
  if (!activeAdapter) {
    // The current and only first-party model is local Qwen3-0.6B.
    activeAdapter = new LocalTinyModelProvider();
  }
  return activeAdapter;
}

/**
 * Test seam: allows adapter contract tests to inject a fake without loading a
 * model. Production UI should not expose this as a model-switching preference.
 */
export function resetKuroModelAdapterForTests(): void {
  activeAdapter = undefined;
}
