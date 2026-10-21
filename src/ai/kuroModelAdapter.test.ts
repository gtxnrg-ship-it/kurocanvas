import { afterEach, describe, expect, it } from "vitest";
import { getKuroModelAdapter, resetKuroModelAdapterForTests } from "./kuroModelAdapter";

afterEach(() => resetKuroModelAdapterForTests());

describe("Kuro model adapter seam", () => {
  it("shares one active adapter instead of creating a new model runtime per request", () => {
    expect(getKuroModelAdapter()).toBe(getKuroModelAdapter());
  });

  it("exposes the current Qwen3-0.6B runtime through the provider contract", async () => {
    const adapter = getKuroModelAdapter();
    const models = await adapter.listModels();
    expect(adapter.id).toBe("kuro-local-browser");
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "kuro-local:qwen3-0.6b",
      location: "local",
      providerId: "kuro-local-browser",
      capabilities: ["chat"],
    });
  });
});
