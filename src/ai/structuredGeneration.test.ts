import { describe, expect, it, vi } from "vitest";
import { generateValidatedStructuredResponse } from "./structuredGeneration";
import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";

const model: ModelDescriptor = {
  id: "kuro-local:qwen3-0.6b",
  name: "Kuro Local",
  providerId: "kuro-local-browser",
  location: "local",
  roles: ["planning"],
  capabilities: ["chat"],
  installed: true,
  enabled: true,
};
const request: ModelRequest = {
  role: "planning",
  responseFormat: "json",
  maxOutputTokens: 3000,
  messages: [
    { role: "system", content: "Return JSON with required keys summary:string and commands:array." },
    { role: "user", content: "Prepare a native drawing plan." },
  ],
};

function makeProvider(responses: ModelResponse[], id = "kuro-local-browser") {
  const generate = vi.fn(async (req: ModelRequest) => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected extra request");
    return { ...response, modelId: model.id, providerId: id };
  });
  const provider: ModelProvider = {
    id,
    displayName: "test provider",
    async listModels() { return [model]; },
    async isAvailable() { return true; },
    generate,
  };
  return { provider, generate };
}
const parsePlan = (raw: string) => {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Plan must be an object.");
  const value = parsed as { summary?: unknown; commands?: unknown };
  if (typeof value.summary !== "string" || !Array.isArray(value.commands)) throw new Error("Plan needs summary and commands.");
  return { summary: value.summary, commands: value.commands };
};

describe("validated structured generation", () => {
  it("regenerates a complete compact value when the first local output is truncated", async () => {
    const { provider, generate } = makeProvider([
      { text: '{"summary":"unfinished","commands":[', finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
      { text: '{"summary":"A compact plan","commands":[]}', finishReason: "stop", usage: { outputTokens: 40 }, modelId: model.id, providerId: model.providerId },
    ]);
    const result = await generateValidatedStructuredResponse(provider, request, model, parsePlan);

    expect(result.attempts).toBe(2);
    expect(result.value).toEqual({ summary: "A compact plan", commands: [] });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]?.[0].maxOutputTokens).toBe(1024);
    const retryMessages = generate.mock.calls[1]?.[0].messages ?? [];
    expect(retryMessages[retryMessages.length - 1]?.content).toContain("REGENERATE THE STRUCTURED RESULT FROM SCRATCH");
  });

  it("accepts a valid structured output even when it reaches the pass ceiling", async () => {
    const { provider, generate } = makeProvider([
      { text: '{"summary":"Valid","commands":[]}', finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
    ]);
    const result = await generateValidatedStructuredResponse(provider, request, model, parsePlan);
    expect(result.attempts).toBe(1);
    expect(result.value.summary).toBe("Valid");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry a valid result from another provider", async () => {
    const { provider, generate } = makeProvider([
      { text: '{"summary":"Remote","commands":[]}', finishReason: "stop", usage: { outputTokens: 50 }, modelId: model.id, providerId: "remote" },
    ], "remote");
    const result = await generateValidatedStructuredResponse(provider, request, model, parsePlan);
    expect(result.value.summary).toBe("Remote");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("fails closed after bounded schema-repair attempts", async () => {
    const { provider, generate } = makeProvider([
      { text: "not json", finishReason: "stop", usage: { outputTokens: 8 }, modelId: model.id, providerId: model.providerId },
      { text: '{"commands":[]}', finishReason: "stop", usage: { outputTokens: 10 }, modelId: model.id, providerId: model.providerId },
    ]);
    await expect(generateValidatedStructuredResponse(provider, request, model, parsePlan)).rejects.toThrow(/did not validate|valid structured result/i);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
