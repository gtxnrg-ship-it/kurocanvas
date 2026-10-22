import { afterEach, describe, expect, it } from "vitest";
import {
  createConfiguredProvider,
  LOCAL_TINY_BASE_URL,
  LOCAL_TINY_MODEL_URI,
  localModelReadinessLabel,
} from "./providerFactory";
import { resetKuroModelAdapterForTests } from "./kuroModelAdapter";

afterEach(() => resetKuroModelAdapterForTests());

describe("configured model provider factory", () => {
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

  it("supports an explicitly configured HTTPS-compatible endpoint without calling it during construction", () => {
    const provider = createConfiguredProvider({
      baseUrl: "https://api.example.invalid/v1",
      modelUri: "some-hosted-model",
      apiKey: "session-only-key",
      allowInsecureLocalhost: false,
      supportsVision: true,
      supportsStructuredOutput: true,
    });
    expect(provider.id).toBe("kuro-configured-compatible");
    expect(provider.displayName).toContain("compatible");
  });

  it("rejects insecure remote endpoints and an empty remote model ID", () => {
    expect(() => createConfiguredProvider({
      baseUrl: "http://api.example.invalid/v1",
      modelUri: "some-hosted-model",
      allowInsecureLocalhost: false,
    })).toThrow(/HTTPS/i);
    expect(() => createConfiguredProvider({
      baseUrl: "https://api.example.invalid/v1",
      modelUri: " ",
      allowInsecureLocalhost: false,
    })).toThrow(/Choose a model ID/i);
  });

  it("does not advertise Qwen as ready before explicit local preparation", () => {
    expect(localModelReadinessLabel()).toContain("not prepared");
    expect(localModelReadinessLabel()).toContain("open Preferences");
  });

  it("rejects a different model URI even when the local base URL is selected", () => {
    expect(() => createConfiguredProvider({
      baseUrl: LOCAL_TINY_BASE_URL,
      modelUri: "another-model",
      allowInsecureLocalhost: false,
    })).toThrow(/only on-device Qwen3-0.6B/i);
  });
});
