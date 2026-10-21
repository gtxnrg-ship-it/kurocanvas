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
  it("updates stroke style immutably and can restore the previous values", () => {
    const drawn = applyNativeDrawingCommand(initial, add).state;
    const edit: NativeDrawingCommand = { version: 1, id: "edit-1", type: "stroke.update", strokeId: "stroke-1", patch: { color: "#abcdef", size: 9 } };
    const updated = applyNativeDrawingCommand(drawn, edit);
    expect(updated.state.strokes[0]).toMatchObject({ color: "#abcdef", size: 9 });
    expect(drawn.strokes[0]).toMatchObject({ color: "#112233", size: 4 });
    const restored = applyNativeDrawingCommand(updated.state, updated.inverse[0]);
    expect(restored.state.strokes[0]).toMatchObject({ color: "#112233", size: 4 });
  });
  it("transforms editable stroke geometry and keeps the original state immutable", () => {
    const drawn = applyNativeDrawingCommand(initial, add).state;
    const transformed = applyNativeDrawingCommand(drawn, {
      version: 1, id: "transform-1", type: "stroke.transform", strokeId: "stroke-1",
      translateX: 10, translateY: 15, scaleX: 2, scaleY: 1.5, rotationDegrees: 0,
    });
    expect(transformed.state.strokes[0].points).toEqual([
      { x: 20, y: 35, pressure: 0.7 },
    ]);
    expect(transformed.state.strokes[0].rotation).toBe(0);
    expect(drawn.strokes[0].points).toEqual([{ x: 10, y: 20, pressure: 0.7 }]);
    expect(transformed.changed).toBe(true);
    expect(transformed.inverse).toHaveLength(2);
  });

  it("rejects transforms that would move editable geometry outside the canvas", () => {
    const drawn = applyNativeDrawingCommand(initial, { ...add, points: [{ x: 1590, y: 1190, pressure: 0.5 }] }).state;
    expect(() => applyNativeDrawingCommand(drawn, {
      version: 1, id: "transform-outside", type: "stroke.transform", strokeId: "stroke-1",
      translateX: 100, translateY: 0, scaleX: 1, scaleY: 1, rotationDegrees: 0,
    })).toThrow(/extend beyond the canvas/i);
    expect(drawn.strokes[0].points[0]).toMatchObject({ x: 1590, y: 1190 });
  });

  it("rejects drawing on a locked layer without mutating input", () => {
    const locked = { ...initial, layers: initial.layers.map(layer => ({ ...layer, locked: true })) };
    expect(() => applyNativeDrawingCommand(locked, add)).toThrow(/locked/);
    expect(locked.strokes).toHaveLength(0);
  });
  it("rejects removing a stroke from a locked layer without mutating input", () => {
    const drawn = applyNativeDrawingCommand(initial, add).state;
    const locked = { ...drawn, layers: drawn.layers.map(layer => ({ ...layer, locked: true })) };
    expect(() => applyNativeDrawingCommand(locked, { version: 1, id: "remove-1", type: "stroke.remove", strokeId: "stroke-1" })).toThrow(/locked/);
    expect(locked.strokes).toHaveLength(1);
    expect(drawn.strokes).toHaveLength(1);
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
