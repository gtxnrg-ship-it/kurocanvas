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
      data: [{ id: "local-model-a", owned_by: "local" }, { id: "" }],
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
      name: "local-model-a",
      modelUri: "local-model-a",
      providerId: "test",
      location: "local",
      capabilities: ["chat"],
      roles: ["reasoning", "planning", "story-writing", "continuity", "fast-helper"],
      installed: true,
      enabled: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:8000/v1/models", expect.any(Object));
  });

  it("does not infer vision capability or hardware estimates from an arbitrary model name", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{ id: "arbitrary-large-model-name" }, { id: "small-vision-model" }],
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      fetchImpl,
    });

    const models = await provider.listModels();

    expect(models).toHaveLength(2);
    expect(models.every(item => item.capabilities.length === 1 && item.capabilities[0] === "chat")).toBe(true);
    expect(models.every(item => item.downloadBytes === undefined && item.memoryBytes === undefined && item.license === undefined)).toBe(true);
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
    const recordedFetch = fetchImpl as unknown as { mock: { calls: unknown[][] } };
    const [, init] = (recordedFetch.mock.calls[0] ?? []) as [RequestInfo | URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "model-a",
      stream: false,
      max_tokens: 100,
      messages: [{ role: "system", content: "Be Kuro." }, { role: "user", content: "Hello." }],
    });
  });

  it("preserves multimodal image_url content in the outbound request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "I can see the sketch." }, finish_reason: "stop" }],
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      fetchImpl,
    });
    const imageUrl = "data:image/jpeg;base64,dGVzdA==";

    await provider.generate({
      role: "planning",
      messages: [
        { role: "user", content: [
          { type: "text", text: "Inspect this canvas." },
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
        ] },
      ],
    }, { ...model, roles: ["planning"], capabilities: ["chat", "vision"] });

    const recordedFetch = fetchImpl as unknown as { mock: { calls: unknown[][] } };
    const [, init] = (recordedFetch.mock.calls[0] ?? []) as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Inspect this canvas." },
      { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
    ]);
  });

  it("returns cancelled without making a network request for an already-aborted request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      fetchImpl,
    });
    const controller = new AbortController();
    controller.abort();

    const result = await provider.generate({
      role: "reasoning",
      messages: [{ role: "user", content: "Cancel me." }],
      signal: controller.signal,
    }, model);

    expect(result.finishReason).toBe("cancelled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });


  it("times out hung model discovery instead of waiting forever", async () => {
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      modelListTimeoutMs: 5,
      fetchImpl,
    });
    await expect(provider.listModels()).rejects.toThrow(/timed out/i);
  });

  it("times out hung generation and returns cancelled when the caller aborts", async () => {
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      baseUrl: "http://localhost:8000/v1",
      allowInsecureLocalhost: true,
      providerId: "test",
      requestTimeoutMs: 5,
      fetchImpl,
    });
    await expect(provider.generate({ role: "reasoning", messages: [{ role: "user", content: "Hang." }] }, model)).rejects.toThrow(/timed out/i);

    const controller = new AbortController();
    const pending = provider.generate({ role: "reasoning", messages: [{ role: "user", content: "Cancel." }], signal: controller.signal }, model);
    controller.abort();
    await expect(pending).resolves.toMatchObject({ finishReason: "cancelled" });
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
