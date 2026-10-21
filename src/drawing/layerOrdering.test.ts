import { describe, expect, it } from "vitest";
import { moveArtworkToLayerEdge } from "./layerOrdering";

const strokes = [
  { id: "a", layerId: "ink" },
  { id: "b", layerId: "color" },
  { id: "c", layerId: "ink" },
  { id: "d", layerId: "ink" },
  { id: "e", layerId: "color" },
];

describe("layer-local object ordering", () => {
  it("sends an object behind other objects in its own layer only", () => {
    const result = moveArtworkToLayerEdge(strokes, "d", "back", "ink");
    expect(result.map(item => item.id)).toEqual(["d", "b", "a", "c", "e"]);
    expect(result.filter(item => item.layerId === "color").map(item => item.id)).toEqual(["b", "e"]);
  });

  it("brings an object to the front of its own layer", () => {
    const result = moveArtworkToLayerEdge(strokes, "a", "front", "ink");
    expect(result.map(item => item.id)).toEqual(["c", "b", "d", "a", "e"]);
  });

  it("returns the same array when the object is already at the edge or missing", () => {
    expect(moveArtworkToLayerEdge(strokes, "a", "back", "ink")).toBe(strokes);
    expect(moveArtworkToLayerEdge(strokes, "missing", "front", "ink")).toBe(strokes);
  });

  it("handles a legacy stroke without an explicit layer ID", () => {
    const legacy = [{ id: "old" }, { id: "new", layerId: "ink" }, { id: "last" }];
    expect(moveArtworkToLayerEdge(legacy, "last", "back", "default").map(item => item.id)).toEqual(["last", "new", "old"]);
  });
});
