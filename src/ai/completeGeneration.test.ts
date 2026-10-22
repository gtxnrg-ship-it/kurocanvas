import { describe, expect, it, vi } from "vitest";
import { generateCompleteLocalReply, KURO_LOCAL_MAX_TOKENS_PER_REPLY } from "./completeGeneration";
import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse } from "./modelRegistry";

const model: ModelDescriptor = {
  id: "local-qwen",
  name: "Kuro Local",
  providerId: "kuro-local-browser",
  location: "local",
  roles: ["reasoning"],
  capabilities: ["chat"],
  installed: true,
  enabled: true,
};
const request: ModelRequest = {
  role: "reasoning",
  messages: [
    { role: "system", content: "You are Kuro. Answer with depth appropriate to the request." },
    { role: "user", content: "Write a detailed explanation with concrete examples." },
  ],
  maxOutputTokens: 4096,
  temperature: 0.7,
};

function providerWith(responses: ModelResponse[], id = "kuro-local-browser") {
  const generate = vi.fn(async (_request: ModelRequest, selectedModel: ModelDescriptor) => {
    const result = responses.shift();
    if (!result) throw new Error("unexpected extra generation pass");
    return { ...result, modelId: selectedModel.id, providerId: id };
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

describe("complete local chat generation", () => {
  it("continues a length-limited answer and returns one combined response", async () => {
    const { provider, generate } = providerWith([
      { text: "The first part explains the main idea", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
      { text: "and this is the next unfinished section.", finishReason: "stop", usage: { outputTokens: 300 }, modelId: model.id, providerId: model.providerId },
    ]);
    const result = await generateCompleteLocalReply(provider, request, model);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]?.[0].maxOutputTokens).toBe(1024);
    expect(generate.mock.calls[1]?.[0].maxOutputTokens).toBe(1024);
    expect(generate.mock.calls[1]?.[0].messages[generate.mock.calls[1]?.[0].messages.length - 1]?.content).toContain("Continue the answer");
    expect(generate.mock.calls[1]?.[0].messages[generate.mock.calls[1]?.[0].messages.length - 1]?.content).toContain("Original user request");
    expect(result.text).toContain("The first part explains the main idea");
    expect(result.text).toContain("this is the next unfinished section");
    expect(result.finishReason).toBe("stop");
    expect(result.usage?.outputTokens).toBe(1324);
  });

  it("preserves both the premise and final constraints of a long original request", async () => {
    const longOriginal = "OPENING PREMISE: Keep the original protagonist and central conflict. "
      + "world detail ".repeat(260)
      + " FINAL CONSTRAINT: Keep the ending unresolved and do not change the approved costume.";
    const { provider, generate } = providerWith([
      { text: "Opening draft " + "continued detail ".repeat(70), finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
      { text: "[KURO_REPLY_COMPLETE]", finishReason: "stop", usage: { outputTokens: 3 }, modelId: model.id, providerId: model.providerId },
    ]);
    await generateCompleteLocalReply(provider, {
      ...request,
      messages: [
        request.messages[0],
        { role: "user", content: longOriginal },
      ],
    }, model);

    const continuation = generate.mock.calls[1]?.[0].messages.at(-1)?.content ?? "";
    expect(continuation).toContain("OPENING PREMISE");
    expect(continuation).toContain("FINAL CONSTRAINT");
    expect(continuation).toContain("middle of original request omitted");
  });

  it("removes an exact repeated overlap and keeps continuation in the same paragraph", async () => {
    const { provider } = providerWith([
      { text: "First sentence ends. The final thought is still being developed", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
      { text: "The final thought is still being developed and the explanation continues.", finishReason: "stop", usage: { outputTokens: 250 }, modelId: model.id, providerId: model.providerId },
    ]);
    const result = await generateCompleteLocalReply(provider, request, model);
    expect(result.text).toBe("First sentence ends. The final thought is still being developed and the explanation continues.");
    expect(result.text.match(/The final thought is still being developed/g)).toHaveLength(1);
  });

  it("preserves a real Markdown heading boundary between continuation passes", async () => {
    const { provider } = providerWith([
      { text: "The opening explanation is complete.", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
      { text: "## Next section\nThe next section begins here.", finishReason: "stop", usage: { outputTokens: 180 }, modelId: model.id, providerId: model.providerId },
    ]);
    const result = await generateCompleteLocalReply(provider, request, model);
    expect(result.text).toContain("The opening explanation is complete.\n\n## Next section");
  });

  it("stops immediately when the model finishes naturally", async () => {
    const { provider, generate } = providerWith([
      { text: "A complete, concise answer.", finishReason: "stop", usage: { outputTokens: 42 }, modelId: model.id, providerId: model.providerId },
    ]);
    const result = await generateCompleteLocalReply(provider, request, model);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("A complete, concise answer.");
    expect(result.finishReason).toBe("stop");
  });

  it("caps the total local chat reply budget and reports when it is exhausted", async () => {
    const responses = Array.from({ length: 12 }, (_, i) => ({
      text: "Part " + (i + 1),
      finishReason: "length" as const,
      usage: { outputTokens: 1024 },
      modelId: model.id,
      providerId: model.providerId,
    }));
    const { provider, generate } = providerWith(responses);
    const result = await generateCompleteLocalReply(provider, { ...request, maxOutputTokens: 50_000 }, model);

    expect(KURO_LOCAL_MAX_TOKENS_PER_REPLY).toBe(12288);
    expect(generate).toHaveBeenCalledTimes(12);
    expect(result.usage?.outputTokens).toBe(12288);
    expect(result.finishReason).toBe("length");
    expect(result.text).toContain("Part 1");
    expect(result.text).toContain("Part 12");
  });

  it("does not change remote providers or requests that fit in one pass", async () => {
    const remote = providerWith([
      { text: "Remote response", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: "remote" },
    ], "remote");
    const result = await generateCompleteLocalReply(remote.provider, request, model);
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("Remote response");
  });

  it("reports cancellation instead of a model error when a continuation is aborted", async () => {
    const { provider, generate } = providerWith([
      { text: "Useful opening.", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
    ]);
    generate.mockImplementationOnce(async () => ({
      text: "Useful opening.", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId,
    })).mockRejectedValueOnce(new Error("Local model request cancelled."));
    const controller = new AbortController();
    const pending = generateCompleteLocalReply(provider, { ...request, signal: controller.signal }, model);
    // Abort after the first length-limited pass has resolved.
    await Promise.resolve();
    controller.abort();
    const result = await pending;
    expect(result.finishReason).toBe("cancelled");
  });

  it("preserves useful partial output if a later pass fails", async () => {
    const { provider, generate } = providerWith([
      { text: "Useful opening.", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId },
    ]);
    generate.mockImplementationOnce(async () => ({
      text: "Useful opening.", finishReason: "length", usage: { outputTokens: 1024 }, modelId: model.id, providerId: model.providerId,
    })).mockRejectedValueOnce(new Error("simulated failure"));
    const result = await generateCompleteLocalReply(provider, request, model);
    expect(result.text).toContain("Useful opening.");
    expect(result.finishReason).toBe("error");
  });
});
