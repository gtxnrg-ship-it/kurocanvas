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
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, type: "arbitrary.code" }] }))).toThrow(/approved native/i);
  });

  it("accepts only existing-stroke removal and safe layer property actions", () => {
    const bounds = { width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [], strokeLayerById: { "existing-1": "ink" } };
    const remove = { version: 1, id: "remove-1", type: "stroke.remove", strokeId: "existing-1" };
    const opacity = { version: 1, id: "opacity-1", type: "layer.setOpacity", layerId: "ink", opacity: 0.5 };
    expect(parseAIStrokePlan(JSON.stringify({ summary: "Clean up", commands: [remove, opacity] }), bounds).commands).toHaveLength(2);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...remove, strokeId: "missing" }] }), bounds)).toThrow(/not in the active document/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...remove, id: "remove-2" }] }), { ...bounds, lockedLayerIds: ["ink"] })).toThrow(/locked layer/i);
  });
  it("rejects out-of-bounds points and unknown layers", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, points: [{ x: 2000, y: 40 }] }] }))).toThrow(/rejected/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, layerId: "missing" }] }))).toThrow(/rejected/i);
  });

  it("limits plan size and point count", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "too many", commands: Array.from({ length: 13 }, (_, i) => ({ ...stroke, id: "s" + i })) }))).toThrow(/12 native actions/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "too many points", commands: [{ ...stroke, points: Array.from({ length: 21 }, (_, i) => ({ x: i, y: i })) }] }))).toThrow(/20 points/i);
  });
});
