import { describe, expect, it } from "vitest";
import { parseAIStrokePlan } from "./aiPlan";

const stroke = {
  version: 1, id: "stroke-1", type: "stroke.add", layerId: "layer-default",
  tool: "brush", color: "#112233", size: 4,
  points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 30, y: 40, pressure: 0.8 }],
};

describe("parseAIStrokePlan", () => {
  it("accepts a bounded native stroke plan", () => {
    expect(parseAIStrokePlan(JSON.stringify({ summary: "A small sketch", commands: [stroke] }))).toMatchObject({
      summary: "A small sketch",
      commands: [{ type: "stroke.add", id: "stroke-1" }],
    });
  });

  it("rejects malformed JSON and non-object payloads", () => {
    expect(() => parseAIStrokePlan("{")).toThrow(/valid JSON/i);
    expect(() => parseAIStrokePlan("[]")).toThrow(/JSON object/i);
  });

  it("rejects unsupported commands before approval", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, type: "stroke.remove" }] }))).toThrow(/additions only/i);
  });

  it("rejects out-of-bounds points and unknown layers", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, points: [{ x: 2000, y: 40 }] }] }))).toThrow(/rejected/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, layerId: "missing" }] }))).toThrow(/rejected/i);
  });

  it("limits plan size and point count", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "too many", commands: Array.from({ length: 13 }, (_, i) => ({ ...stroke, id: "s" + i })) }))).toThrow(/12 strokes/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "too many points", commands: [{ ...stroke, points: Array.from({ length: 21 }, (_, i) => ({ x: i, y: i })) }] }))).toThrow(/20 points/i);
  });
});
