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
  it("converts model-authored shape rotation from degrees to canvas radians", () => {
    const result = applyNativeDrawingCommand(initial, {
      ...add,
      shape: "rectangle",
      rotation: 90,
      points: [{ x: 100, y: 100, pressure: 0.5 }, { x: 200, y: 150, pressure: 0.5 }],
    });
    expect(result.state.strokes[0].rotation).toBeCloseTo(Math.PI / 2);
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

  it("applies rotation transforms in degrees and preserves an exact reversible snapshot", () => {
    const drawn = applyNativeDrawingCommand(initial, {
      ...add, points: [{ x: 100, y: 100, pressure: 0.5 }, { x: 200, y: 100, pressure: 0.8 }],
    }).state;
    const transformed = applyNativeDrawingCommand(drawn, {
      version: 1, id: "rotate-1", type: "stroke.transform", strokeId: "stroke-1",
      translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotationDegrees: 90,
    });
    expect(transformed.state.strokes[0].rotation).toBeCloseTo(Math.PI / 2);
    expect(transformed.state.strokes[0].points).toEqual(drawn.strokes[0].points);
    const restored = applyNativeDrawingPlan(transformed.state, transformed.inverse);
    expect(restored.state.strokes).toEqual(drawn.strokes);
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
  it("creates a layer and reverses the entire layer-plus-stroke plan", () => {
    const plan: NativeDrawingCommand[] = [
      { version: 1, id: "create-detail", type: "layer.add", layerId: "detail", name: "Detail ink", index: 1 },
      { version: 1, id: "detail-stroke", type: "stroke.add", layerId: "detail", tool: "brush", color: "#abcdef", size: 3, points: [{ x: 40, y: 45, pressure: 0.6 }] },
    ];
    const result = applyNativeDrawingPlan(initial, plan);
    expect(result.state.layers.map(layer => layer.id)).toEqual(["ink", "detail"]);
    expect(result.state.strokes[0].layerId).toBe("detail");
    expect(result.inverse.map(command => command.type)).toEqual(["stroke.remove", "layer.remove"]);
    const undone = applyNativeDrawingPlan(result.state, result.inverse);
    expect(undone.state.layers).toEqual(initial.layers);
    expect(undone.state.strokes).toEqual(initial.strokes);
  });

  it("renames and reorders layers with reversible inverses", () => {
    const twoLayers = {
      ...initial,
      layers: [...initial.layers, { id: "tone", name: "Tone", order: 1, visible: true, locked: false, opacity: 1, blendMode: "normal" as const }],
    };
    const renamed = applyNativeDrawingCommand(twoLayers, { version: 1, id: "rename", type: "layer.rename", layerId: "tone", name: "Background wash" });
    expect(renamed.state.layers[1].name).toBe("Background wash");
    const restoredName = applyNativeDrawingCommand(renamed.state, renamed.inverse[0]);
    expect(restoredName.state.layers[1].name).toBe("Tone");

    const reordered = applyNativeDrawingCommand(twoLayers, { version: 1, id: "reorder", type: "layer.reorder", layerId: "tone", index: 0 });
    expect(reordered.state.layers.map(layer => [layer.id, layer.order])).toEqual([["tone", 0], ["ink", 1]]);
    const restoredOrder = applyNativeDrawingCommand(reordered.state, reordered.inverse[0]);
    expect(restoredOrder.state.layers.map(layer => [layer.id, layer.order])).toEqual([["ink", 0], ["tone", 1]]);
  });

  it("removes only empty non-final layers and can restore the full layer record", () => {
    const twoLayers = {
      ...initial,
      layers: [...initial.layers, { id: "tone", name: "Tone", order: 1, visible: false, locked: true, opacity: 0.4, blendMode: "multiply" as const }],
    };
    const removed = applyNativeDrawingCommand(twoLayers, { version: 1, id: "remove-empty", type: "layer.remove", layerId: "tone" });
    expect(removed.state.layers.map(layer => layer.id)).toEqual(["ink"]);
    expect(removed.inverse[0]).toMatchObject({ type: "layer.restore", index: 1, layer: { id: "tone", name: "Tone", visible: false, locked: true, opacity: 0.4, blendMode: "multiply" } });
    const restored = applyNativeDrawingCommand(removed.state, removed.inverse[0]);
    expect(restored.state.layers).toEqual(twoLayers.layers);
    expect(() => applyNativeDrawingCommand(initial, { version: 1, id: "remove-last", type: "layer.remove", layerId: "ink" })).toThrow(/last remaining layer/);
    const withStroke = applyNativeDrawingCommand(initial, add).state;
    expect(() => applyNativeDrawingCommand({ ...withStroke, layers: [...withStroke.layers, { id: "tone", name: "Tone", order: 1, visible: true, locked: false, opacity: 1, blendMode: "normal" }] }, { version: 1, id: "remove-content", type: "layer.remove", layerId: "ink" })).toThrow(/contains strokes/);
  });

  it("does not mutate original state when a plan fails partway through", () => {
    const bad: NativeDrawingCommand = { version: 1, id: "missing", type: "stroke.remove", strokeId: "not-there" };
    expect(() => applyNativeDrawingPlan(initial, [add, bad])).toThrow(/does not exist/);
    expect(initial.strokes).toHaveLength(0);
  });
});
