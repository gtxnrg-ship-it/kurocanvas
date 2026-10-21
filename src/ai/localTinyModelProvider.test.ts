import { describe, expect, it } from "vitest";
import { LocalTinyModelProvider, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, type ModelWorker, type WorkerRequest, type WorkerResponse } from "./localTinyModelProvider";

describe("LocalTinyModelProvider", () => {
  it("advertises Qwen3-0.6B as a text-only local model without pretending it has vision", async () => {
    const provider = new LocalTinyModelProvider();
    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "kuro-local:qwen3-0.6b",
      providerId: "kuro-local-browser",
      location: "local",
      downloadBytes: 370_000_000,
      license: "Apache-2.0",
      capabilities: ["chat"],
      metadata: { modelId: KURO_TINY_MODEL_ID, vision: false },
    });
    expect(KURO_TINY_MODEL_DOWNLOAD_BYTES).toBe(137_000_000);
  });

  it("uses the Qwen3-0.6B ONNX model", async () => {
    expect(KURO_TINY_MODEL_ID).toBe("onnx-community/Qwen3-0.6B-DQ-ONNX");
    const provider = new LocalTinyModelProvider();
    expect(provider.displayName).toContain("Qwen3-0.6B");
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

  it("runs generation through an injected worker and returns its result", async () => {
    const { worker, sent } = fakeWorker(true);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    const result = await provider.generate({
      role: "fast-helper",
      messages: [{ role: "user", content: "Help plan a panel." }],
      maxOutputTokens: 64,
    }, model);
    expect(sent.some(request => request.type === "generate")).toBe(true);
    expect(result).toMatchObject({ text: "Kuro worker response", finishReason: "stop", providerId: provider.id, usage: { outputTokens: 5 } });
  });

  it("actually terminates the worker when inference is cancelled", async () => {
    const { worker, state } = fakeWorker(false);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    const controller = new AbortController();
    const pending = provider.generate({
      role: "fast-helper",
      messages: [{ role: "user", content: "Draw a panel." }],
      signal: controller.signal,
    }, model);
    controller.abort();
    expect(await pending).toMatchObject({ text: "", finishReason: "cancelled" });
    expect(state.terminated).toBe(true);
  });

  it("terminates the worker when the user cancels model download or preparation", async () => {
    const { worker, state } = fakeWorker(false);
    const provider = new LocalTinyModelProvider(() => worker);
    const controller = new AbortController();
    const pending = provider.prepare(controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/i);
    expect(state.terminated).toBe(true);
  });
});

function fakeWorker(autoRespond: boolean): { worker: ModelWorker; sent: WorkerRequest[]; state: { terminated: boolean } } {
  const sent: WorkerRequest[] = [];
  const state = { terminated: false };
  let worker: ModelWorker;
  worker = {
    onmessage: null,
    onerror: null,
    postMessage(request: WorkerRequest) {
      sent.push(request);
      if (!autoRespond) return;
      const response: WorkerResponse = request.type === "prepare"
        ? { id: request.id, type: "ready" }
        : { id: request.id, type: "result", text: "Kuro worker response", outputTokens: 5, finishReason: "stop" };
      queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<WorkerResponse>));
    },
    terminate() { state.terminated = true; },
  };
  return { worker, sent, state };
}
