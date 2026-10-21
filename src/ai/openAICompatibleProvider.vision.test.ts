import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider, inferModelCapabilities } from "./openAICompatibleProvider";
import type { ModelDescriptor, ModelRequest } from "./modelRegistry";

describe("vision capability inference", () => {
  it.each([
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-5.6",
    "gemini-2.5-flash",
    "claude-sonnet-4",
    "Qwen2.5-VL-7B",
    "llama-3.2-vision",
    "pixtral-large",
  ])("recognizes likely vision model %s", name => {
    expect(inferModelCapabilities(name)).toContain("vision");
  });

  it("does not assume a plain text model supports images", () => {
    expect(inferModelCapabilities("llama-3.1-8b-instruct")).toEqual(["chat"]);
  });

  it("serializes explicitly supplied image_url parts to the configured provider", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "I can see the reference." }, finish_reason: "stop" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://models.example/v1", providerId: "test", fetchImpl: mockFetch as unknown as typeof fetch });
    const model: ModelDescriptor = {
      id: "test:gpt-4o", name: "gpt-4o", providerId: "test", location: "remote",
      roles: ["reasoning"], capabilities: ["chat","vision"], installed: true, enabled: true, modelUri: "gpt-4o",
    };
    const request: ModelRequest = {
      role: "reasoning",
      messages: [{ role: "user", content: [
        { type: "text", text: "Use this hairstyle reference." },
        { type: "image_url", image_url: { url: "https://upload.wikimedia.org/example.jpg", detail: "low" } },
      ] }],
    };
    const response = await provider.generate(request, model);
    expect(response.text).toBe("I can see the reference.");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "https://upload.wikimedia.org/example.jpg", detail: "low" } });
  });
});
