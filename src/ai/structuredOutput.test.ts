import { describe, expect, it } from "vitest";
import { parseModelJson } from "./structuredOutput";

describe("model structured-output recovery", () => {
  it("accepts ordinary JSON objects and arrays", () => {
    expect(parseModelJson<{ ok: boolean }>('{ "ok": true }')).toEqual({ ok: true });
    expect(parseModelJson<number[]>("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("recovers JSON from Markdown fences and surrounding commentary", () => {
    expect(parseModelJson("Here is the plan:\n```json\n{\"summary\":\"ready\",\"commands\":[]}\n```\nDone."))
      .toEqual({ summary: "ready", commands: [] });
  });

  it("handles braces and escaped quotes inside JSON strings", () => {
    expect(parseModelJson('Output: {"summary":"Use {x} and \\"quoted\\" text","commands":[]} thanks'))
      .toEqual({ summary: 'Use {x} and "quoted" text', commands: [] });
  });

  it("recovers a balanced value from leading prose without inventing missing fields", () => {
    expect(parseModelJson('I will return the requested value now: {"items":[{"name":"Kuro"}]}'))
      .toEqual({ items: [{ name: "Kuro" }] });
  });

  it("rejects empty, malformed, and oversized output", () => {
    expect(() => parseModelJson("  ")).toThrow(/empty/i);
    expect(() => parseModelJson("Here's JSON: {not valid}")).toThrow(/recoverable JSON/i);
    expect(() => parseModelJson('{"ok":true}', 4)).toThrow(/size limit/i);
  });
});
