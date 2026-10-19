import { describe, expect, it } from "vitest";
import { applyNativeDrawingCommand, applyNativeDrawingPlan, type NativeDrawingState } from "./nativeExecutor";
import type { NativeDrawingCommand } from "./commands";

const initial: NativeDrawingState = {
  width: 1600, height: 1200, strokes: [],
  layers: [{ id: "ink", name: "Ink", order: 0, visible: true, locked: false, opacity: 1, blendMode: "normal" }],
};
const add: NativeDrawingCommand = {
  version: 1, id: "stroke-1", type: "stroke.add", layerId: "ink",
  tool: "brush", color: "#112233", size: 4, points: [{ x: 10, y: 20, pressure: 0.7 }],
};

describe("native drawing executor", () => {
  it("adds a stroke and creates an inverse command", () => {
    const result = applyNativeDrawingCommand(initial, add);
    expect(result.state.strokes).toHaveLength(1);
    expect(result.inverse[0]).toMatchObject({ type: "stroke.remove", strokeId: "stroke-1" });
    expect(initial.strokes).toHaveLength(0);
  });
  it("rejects drawing on a locked layer without mutating input", () => {
    const locked = { ...initial, layers: initial.layers.map(layer => ({ ...layer, locked: true })) };
    expect(() => applyNativeDrawingCommand(locked, add)).toThrow(/locked/);
    expect(locked.strokes).toHaveLength(0);
  });
  it("applies layer settings immutably and records the previous value", () => {
    const result = applyNativeDrawingCommand(initial, { version: 1, id: "opacity-1", type: "layer.setOpacity", layerId: "ink", opacity: 0.4 });
    expect(result.state.layers[0].opacity).toBe(0.4);
    expect(result.inverse[0]).toMatchObject({ type: "layer.setOpacity", opacity: 1 });
    expect(initial.layers[0].opacity).toBe(1);
  });
  it("does not mutate original state when a plan fails partway through", () => {
    const bad: NativeDrawingCommand = { version: 1, id: "missing", type: "stroke.remove", strokeId: "not-there" };
    expect(() => applyNativeDrawingPlan(initial, [add, bad])).toThrow(/does not exist/);
    expect(initial.strokes).toHaveLength(0);
  });
});
