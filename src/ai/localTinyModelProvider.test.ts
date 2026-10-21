import { describe, expect, it } from "vitest";
import { LocalTinyModelProvider, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID } from "./localTinyModelProvider";

describe("LocalTinyModelProvider", () => {
  it("advertises one compact text-only local model without pretending it has vision", async () => {
    const provider = new LocalTinyModelProvider();
    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "kuro-local:smollm2-135m-instruct",
      providerId: "kuro-local-browser",
      location: "local",
      downloadBytes: 137_000_000,
      license: "Apache-2.0",
      capabilities: ["chat", "structured-output"],
      metadata: { modelId: KURO_TINY_MODEL_ID, vision: false },
    });
    expect(KURO_TINY_MODEL_DOWNLOAD_BYTES).toBe(137_000_000);
  });

  it("fails closed for image-bearing requests instead of silently dropping the image", async () => {
    const provider = new LocalTinyModelProvider();
    const model = (await provider.listModels())[0];
    await expect(provider.generate({
      role: "planning",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Inspect this drawing" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
        ],
      }],
    }, model)).rejects.toThrow(/text-only/);
  });

  it("honors requests already cancelled before model loading", async () => {
    const provider = new LocalTinyModelProvider();
    const model = (await provider.listModels())[0];
    const controller = new AbortController();
    controller.abort();
    const result = await provider.generate({
      role: "reasoning",
      messages: [{ role: "user", content: "Stop" }],
      signal: controller.signal,
    }, model);
    expect(result.finishReason).toBe("cancelled");
  });
});
