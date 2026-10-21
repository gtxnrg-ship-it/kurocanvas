import { describe, expect, it } from "vitest";
import { createLocalModelBenchmark, validateLocalModelBenchmark, localBenchmarkRatingLabel } from "./modelBenchmark";

describe("on-device local model benchmark", () => {
  it("classifies measured generation speed without claiming drawing quality", () => {
    expect(createLocalModelBenchmark("model", 18, 1000)).toMatchObject({ tokensPerSecond: 18, rating: "fast" });
    expect(createLocalModelBenchmark("model", 12, 2000)).toMatchObject({ tokensPerSecond: 6, rating: "usable" });
    expect(createLocalModelBenchmark("model", 12, 4000)).toMatchObject({ tokensPerSecond: 3, rating: "slow" });
    expect(createLocalModelBenchmark("model", 4, 1000).rating).toBe("inconclusive");
    expect(localBenchmarkRatingLabel("fast")).toContain("text generation");
  });

  it("rejects invalid inputs and malformed saved data", () => {
    expect(() => createLocalModelBenchmark("", 10, 1000)).toThrow(/model ID/);
    expect(() => createLocalModelBenchmark("model", -1, 1000)).toThrow(/output tokens/);
    expect(() => createLocalModelBenchmark("model", 10, 0)).toThrow(/duration/);
    expect(validateLocalModelBenchmark({ schemaVersion: 1, modelId: "model", rating: "fast" })).toBe(false);
  });

  it("expires measurements older than thirty days and rejects timestamps far in the future", () => {
    const now = Date.parse("2026-10-21T00:00:00.000Z");
    const old = createLocalModelBenchmark("model", 16, 1000, "2026-09-01T00:00:00.000Z");
    const recent = createLocalModelBenchmark("model", 16, 1000, "2026-10-20T00:00:00.000Z");
    const future = createLocalModelBenchmark("model", 16, 1000, "2027-01-01T00:00:00.000Z");
    expect(validateLocalModelBenchmark(old, now)).toBe(false);
    expect(validateLocalModelBenchmark(recent, now)).toBe(true);
    expect(validateLocalModelBenchmark(future, now)).toBe(false);
  });

  it("detects inconsistent speed or rating fields in stored records", () => {
    const value = createLocalModelBenchmark("model", 18, 1000);
    expect(validateLocalModelBenchmark({ ...value, tokensPerSecond: 1 })).toBe(false);
    expect(validateLocalModelBenchmark({ ...value, rating: "slow" })).toBe(false);
  });
});
