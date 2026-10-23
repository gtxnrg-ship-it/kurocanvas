import { afterEach, describe, expect, it } from "vitest";
import {
  createConfiguredProvider,
  LOCAL_TINY_BASE_URL,
  LOCAL_TINY_MODEL_URI,
  localModelReadinessLabel,
  providerReadinessLabel,
} from "./providerFactory";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
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

  it("requires explicit consent before constructing an external provider", () => {
    expect(() => createConfiguredProvider({
      baseUrl: "https://api.example.invalid/v1",
      modelUri: "some-hosted-model",
      apiKey: "must-not-be-used",
      allowInsecureLocalhost: false,
    })).toThrow(/explicitly consent/i);
  });

  it("constructs the OpenAI-compatible provider only after explicit consent", () => {
    const provider = createConfiguredProvider({
      baseUrl: "https://api.example.invalid/v1",
      modelUri: "some-hosted-model",
      apiKey: "session-only-token",
      allowInsecureLocalhost: false,
      allowRemoteData: true,
      supportsVision: true,
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("labels remote-context and image-sharing status truthfully", () => {
    expect(providerReadinessLabel({
      baseUrl: "https://api.example.invalid/v1", allowRemoteData: true, supportsVision: true,
    })).toContain("project context goes to the configured endpoint");
    expect(providerReadinessLabel({
      baseUrl: "https://api.example.invalid/v1", allowRemoteData: true, supportsVision: true,
    })).toContain("image input enabled");
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
