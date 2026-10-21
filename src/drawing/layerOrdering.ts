export type LayerEdge = "front" | "back";

export interface LayeredArtwork {
  id: string;
  layerId?: string;
}

export function moveArtworkToLayerEdge<T extends LayeredArtwork>(
  strokes: T[],
  id: string,
  edge: LayerEdge,
  defaultLayerId?: string,
): T[] {
  const selected = strokes.find(stroke => stroke.id === id);
  if (!selected) return strokes;
  const layerId = selected.layerId || defaultLayerId;
  const indices = strokes.map((stroke, index) => ({ stroke, index }))
    .filter(item => (item.stroke.layerId || defaultLayerId) === layerId)
    .map(item => item.index);
  const currentIndex = indices.findIndex(index => strokes[index].id === id);
  if (currentIndex < 0 || indices.length < 2 || (edge === "back" && currentIndex === 0) || (edge === "front" && currentIndex === indices.length - 1)) return strokes;
  const ordered = indices.map(index => strokes[index]);
  const [moving] = ordered.splice(currentIndex, 1);
  if (edge === "back") ordered.unshift(moving);
  else ordered.push(moving);
  const result = strokes.slice();
  indices.forEach((index, position) => { result[index] = ordered[position]; });
  return result;
}
