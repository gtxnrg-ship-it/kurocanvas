import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
import type { ModelDescriptor } from "./modelRegistry";

const model: ModelDescriptor = {
  id: "test:model-a",
  name: "model-a",
  providerId: "test",
  location: "local",
  roles: ["reasoning", "planning"],
  capabilities: ["chat"],
  modelUri: "model-a",
  installed: true,
  enabled: true,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenAICompatibleProvider", () => {
  it("rejects insecure remote endpoints and accepts explicitly enabled localhost", () => {
    expect(() => new OpenAICompatibleProvider({ baseUrl: "http://example.com/v1" })).toThrow(/HTTPS/);
    expect(() => new OpenAICompatibleProvider({ baseUrl: "http://localhost:8000/v1" })).toThrow(/HTTPS/);
    expect(() => new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
    })).not.toThrow();
  });

  it("lists model IDs from an OpenAI-compatible endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{ id: "Qwen/Qwen3.8-27B", owned_by: "local" }, { id: "" }],
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      fetchImpl,
    });

    const models = await provider.listModels();

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "Qwen/Qwen3.8-27B",
      modelUri: "Qwen/Qwen3.8-27B",
      providerId: "test",
      location: "local",
      installed: true,
      enabled: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:8000/v1/models", expect.any(Object));
  });

  it("sends the selected model and messages to chat completions", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      model: "model-a",
      choices: [{ message: { content: "Hello from Kuro." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      fetchImpl,
    });

    const result = await provider.generate({
      role: "reasoning",
      messages: [
        { role: "system", content: "Be Kuro." },
        { role: "user", content: "Hello." },
      ],
      maxOutputTokens: 100,
    }, model);

    expect(result).toMatchObject({
      text: "Hello from Kuro.",
      modelId: "test:model-a",
      providerId: "test",
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    const [, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [RequestInfo | URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "model-a",
      stream: false,
      max_tokens: 100,
      messages: [{ role: "system", content: "Be Kuro." }, { role: "user", content: "Hello." }],
    });
  });

  it("does not allow a model from a different provider", async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.com/v1",
      providerId: "test",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(provider.generate({ role: "reasoning", messages: [] }, { ...model, providerId: "other" }))
      .rejects.toThrow(/different provider/);
  });
});
