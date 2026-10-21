import { describe, expect, it } from "vitest";
import { KURO_MODEL_CATALOG } from "./modelCatalog";

describe("Kuro active model catalog", () => {
  it("contains only the currently shipped Qwen3-0.6B browser runtime", () => {
    expect(KURO_MODEL_CATALOG).toHaveLength(1);
    expect(KURO_MODEL_CATALOG[0]).toMatchObject({
      id: "qwen3-0.6b-web",
      name: "Qwen3-0.6B (Q4F16 ONNX)",
      runtime: "transformers-js-web",
      status: "available-in-web-build",
      modalities: ["text"],
    });
  });

  it("does not advertise unimplemented runtime candidates or vision support", () => {
    expect(KURO_MODEL_CATALOG.every(model => model.status === "available-in-web-build")).toBe(true);
    expect(KURO_MODEL_CATALOG.every(model => model.modalities.includes("text") && !model.modalities.includes("image"))).toBe(true);
  });
});
