import { describe, expect, it } from "vitest";
import { KURO_MODEL_CATALOG } from "./modelCatalog";

describe("Kuro model catalog", () => {
  it("has distinct device tiers and clearly marks runtime readiness", () => {
    expect(KURO_MODEL_CATALOG.some(model => model.tier === "entry")).toBe(true);
    expect(KURO_MODEL_CATALOG.some(model => model.tier === "mid")).toBe(true);
    expect(KURO_MODEL_CATALOG.some(model => model.tier === "flagship")).toBe(true);
    expect(KURO_MODEL_CATALOG.find(model => model.id === "smollm2-135m-web")?.status).toBe("available-in-web-build");
    expect(KURO_MODEL_CATALOG.filter(model => model.id !== "smollm2-135m-web").every(model => model.status !== "available-in-web-build")).toBe(true);
  });
  it("does not advertise the tiny browser model as vision-capable", () => {
    expect(KURO_MODEL_CATALOG.find(model => model.id === "smollm2-135m-web")?.modalities).toEqual(["text"]);
  });
});
