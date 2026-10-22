import { describe, expect, it, vi } from "vitest";
import { persistSequentially, SequentialPersistenceError } from "./sequentialPersistence";

describe("sequential persistence", () => {
  it("persists records in order and returns the number confirmed saved", async () => {
    const writes: number[] = [];
    const saved = await persistSequentially([3, 1, 4], async (item, index) => {
      writes.push(item);
      expect(index).toBe(writes.length - 1);
    });
    expect(saved).toBe(3);
    expect(writes).toEqual([3, 1, 4]);
  });

  it("reports the exact committed prefix when a later write fails", async () => {
    const writes: string[] = [];
    let failure: unknown;
    try {
      await persistSequentially(["user", "assistant", "reference"], async item => {
        if (item === "reference") throw new Error("Quota exceeded");
        writes.push(item);
      });
    } catch (error) {
      failure = error;
    }
    expect(writes).toEqual(["user", "assistant"]);
    expect(failure).toBeInstanceOf(SequentialPersistenceError);
    expect(failure).toMatchObject({ savedCount: 2 });
    expect((failure as Error).message).toMatch(/Quota exceeded/);
  });

  it("allows the unsaved suffix to retry without rewriting the committed prefix", async () => {
    const writes: string[] = [];
    const first = ["one", "two", "three"];
    let attempts = 0;
    try {
      await persistSequentially(first, async item => {
        attempts++;
        if (item === "three" && attempts === 3) throw new Error("Temporary storage failure");
        writes.push(item);
      });
    } catch (error) {
      expect(error).toMatchObject({ savedCount: 2 });
      const savedCount = (error as SequentialPersistenceError).savedCount;
      await persistSequentially(first.slice(savedCount), async item => { writes.push(item); });
    }
    expect(writes).toEqual(["one", "two", "three"]);
  });
});
