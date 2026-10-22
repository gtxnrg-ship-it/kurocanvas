import { describe, expect, it } from "vitest";
import { boundMessages, KURO_LOCAL_MAX_OUTPUT_TOKENS, LocalTinyModelProvider, KURO_TINY_MODEL_DOWNLOAD_BYTES, KURO_TINY_MODEL_ID, type ModelWorker, type WorkerRequest, type WorkerResponse } from "./localTinyModelProvider";

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
      roles: ["reasoning", "planning", "tool-calling", "coding", "story-writing", "continuity", "research", "fast-helper"],
      capabilities: ["chat"],
      metadata: { modelId: KURO_TINY_MODEL_ID, vision: false },
    });
    expect(KURO_TINY_MODEL_DOWNLOAD_BYTES).toBe(370_000_000);
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

  it("does not start a worker or download weights from a normal chat request", async () => {
    const { worker, sent, state } = fakeWorker(true);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    expect(model.installed).toBe(false);
    await expect(provider.generate({
      role: "reasoning",
      messages: [{ role: "user", content: "Let's make a character." }],
    }, model)).rejects.toThrow(/will not download model weights from an ordinary chat message/i);
    expect(sent).toEqual([]);
    expect(state.terminated).toBe(false);
  });

  it("marks the descriptor prepared only after the explicit preparation request succeeds", async () => {
    const { worker } = fakeWorker(true);
    const provider = new LocalTinyModelProvider(() => worker);
    expect((await provider.listModels())[0].installed).toBe(false);
    await provider.prepare();
    expect((await provider.listModels())[0].installed).toBe(true);
    expect(provider.isPrepared()).toBe(true);
  });

  it("runs generation through an injected worker and returns its result", async () => {
    const { worker, sent } = fakeWorker(true);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    await provider.prepare();
    const result = await provider.generate({
      role: "fast-helper",
      messages: [{ role: "user", content: "Help plan a panel." }],
      maxOutputTokens: 64,
      temperature: 0,
    }, model);
    expect(sent.some(request => request.type === "generate")).toBe(true);
    expect(sent.find(request => request.type === "generate")).toMatchObject({ temperature: 0, maxOutputTokens: 64 });
    expect(result).toMatchObject({ text: "Kuro worker response", finishReason: "stop", providerId: provider.id, usage: { outputTokens: 5 } });
  });


  it("keeps an individual local inference pass memory-bounded", async () => {
    const { worker, sent } = fakeWorker(true);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    await provider.prepare();
    await provider.generate({
      role: "planning",
      messages: [{ role: "user", content: "Plan a multi-panel page with editable native strokes." }],
      maxOutputTokens: 6000,
    }, model);
    expect(KURO_LOCAL_MAX_OUTPUT_TOKENS).toBe(1024);
    expect(sent.find(request => request.type === "generate")).toMatchObject({ maxOutputTokens: 1024 });
  });

  it("clamps out-of-range temperatures and preserves the requested sampling value", async () => {
    const { worker, sent } = fakeWorker(true);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    await provider.prepare();
    await provider.generate({
      role: "story-writing",
      messages: [{ role: "user", content: "Continue." }],
      temperature: -2,
    }, model);
    expect(sent.find(request => request.type === "generate")).toMatchObject({ temperature: 0 });
  });

  it("preserves the live task and the system rules when clipping long context", () => {
    const system = "SYSTEM-OPEN " + "creative rules ".repeat(900) + " SYSTEM-TAIL";
    const current = "CURRENT USER TASK: continue chapter 14 and preserve the character's scar. " + "specific detail ".repeat(160) + " TASK-END";
    const bounded = boundMessages([
      { role: "system", content: system },
      { role: "assistant", content: "History " + "old context ".repeat(100) },
      { role: "user", content: current },
    ], 1200);
    expect(bounded.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(1200);
    expect(bounded[0]?.content).toContain("SYSTEM-OPEN");
    expect(bounded[0]?.content).toContain("SYSTEM-TAIL");
    expect(bounded[bounded.length - 1]?.role).toBe("user");
    expect(bounded[bounded.length - 1]?.content).toContain("CURRENT USER TASK");
    expect(bounded[bounded.length - 1]?.content).toContain("TASK-END");
  });

  it("actually terminates the worker when inference is cancelled", async () => {
    const { worker, state } = fakeWorker(false, true);
    const provider = new LocalTinyModelProvider(() => worker);
    const model = (await provider.listModels())[0];
    await provider.prepare();
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

function fakeWorker(autoRespond: boolean, respondToPrepare = autoRespond): { worker: ModelWorker; sent: WorkerRequest[]; state: { terminated: boolean } } {
  const sent: WorkerRequest[] = [];
  const state = { terminated: false };
  let worker: ModelWorker;
  worker = {
    onmessage: null,
    onerror: null,
    postMessage(request: WorkerRequest) {
      sent.push(request);
      if (request.type === "prepare" ? !respondToPrepare : !autoRespond) return;
      const response: WorkerResponse = request.type === "prepare"
        ? { id: request.id, type: "ready" }
        : { id: request.id, type: "result", text: "Kuro worker response", outputTokens: 5, finishReason: "stop" };
      queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<WorkerResponse>));
    },
    terminate() { state.terminated = true; },
  };
  return { worker, sent, state };
}
