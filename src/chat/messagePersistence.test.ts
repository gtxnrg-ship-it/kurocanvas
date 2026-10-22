import { describe, expect, it, vi } from "vitest";
import { persistMessageRange } from "./messagePersistence";

describe("conversation message persistence", () => {
  it("advances the cursor only after each write succeeds", async () => {
    const messages = ["user 1", "Kuro 1", "user 2"];
    const saved: string[] = [];
    const cursors: number[] = [];
    const next = await persistMessageRange(
      messages,
      0,
      async message => { saved.push(message); },
      cursor => cursors.push(cursor),
    );
    expect(saved).toEqual(messages);
    expect(cursors).toEqual([1, 2, 3]);
    expect(next).toBe(3);
  });

  it("leaves the cursor at the confirmed prefix when a write fails", async () => {
    const messages = ["first", "second", "third"];
    const saved: string[] = [];
    const cursors: number[] = [];
    const save = vi.fn(async (message: string) => {
      if (message === "second") throw new Error("IndexedDB quota exceeded");
      saved.push(message);
    });
    await expect(persistMessageRange(messages, 0, save, cursor => cursors.push(cursor)))
      .rejects.toThrow(/quota exceeded/i);
    expect(saved).toEqual(["first"]);
    expect(cursors).toEqual([1]);
  });

  it("retries from the failed message without duplicating saved entries", async () => {
    const messages = ["first", "second", "third"];
    const saved: string[] = [];
    let failSecond = true;
    let cursor = 0;
    const save = async (message: string) => {
      if (message === "second" && failSecond) {
        failSecond = false;
        throw new Error("Temporary write failure");
      }
      saved.push(message);
    };
    await expect(persistMessageRange(messages, cursor, save, next => { cursor = next; }))
      .rejects.toThrow(/Temporary write failure/);
    expect(cursor).toBe(1);
    expect(saved).toEqual(["first"]);
    cursor = await persistMessageRange(messages, cursor, save, next => { cursor = next; });
    expect(cursor).toBe(3);
    expect(saved).toEqual(messages);
  });

  it("supports empty ranges and rejects invalid cursors", async () => {
    const save = vi.fn(async () => undefined);
    expect(await persistMessageRange([], 0, save)).toBe(0);
    expect(await persistMessageRange(["one"], 1, save)).toBe(1);
    await expect(persistMessageRange(["one"], 2, save)).rejects.toThrow(/cursor/i);
    expect(save).not.toHaveBeenCalled();
  });
});
