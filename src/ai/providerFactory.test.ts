import { afterEach, describe, expect, it } from "vitest";
import {
  createConfiguredProvider,
  LOCAL_TINY_BASE_URL,
  LOCAL_TINY_MODEL_URI,
} from "./providerFactory";
import { resetKuroModelAdapterForTests } from "./kuroModelAdapter";

afterEach(() => resetKuroModelAdapterForTests());

describe("single-model provider factory", () => {
  it("returns the shared Qwen adapter only for the canonical local config", async () => {
    const config = {
      baseUrl: LOCAL_TINY_BASE_URL,
      modelUri: LOCAL_TINY_MODEL_URI,
      allowInsecureLocalhost: false,
    };
    const first = createConfiguredProvider(config);
    const second = createConfiguredProvider(config);
    expect(first).toBe(second);
    expect(await first.listModels()).toMatchObject([{
      id: "kuro-local:qwen3-0.6b",
      providerId: "kuro-local-browser",
      location: "local",
      capabilities: ["chat"],
    }]);
  });

  it("rejects remote URLs instead of silently sending prompts to a hosted provider", () => {
    expect(() => createConfiguredProvider({
      baseUrl: "https://api.example.invalid/v1",
      modelUri: "some-hosted-model",
      apiKey: "must-not-be-used",
      allowInsecureLocalhost: false,
    })).toThrow(/only on-device Qwen3-0.6B/i);
  });

  it("rejects a different model URI even when the local base URL is selected", () => {
    expect(() => createConfiguredProvider({
      baseUrl: LOCAL_TINY_BASE_URL,
      modelUri: "another-model",
      allowInsecureLocalhost: false,
    })).toThrow(/only on-device Qwen3-0.6B/i);
  });
});
