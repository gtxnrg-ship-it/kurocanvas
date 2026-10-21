export type SymmetryMode = 'none' | 'vertical' | 'horizontal' | 'both';
export type SymmetryPoint = { x: number; y: number; pressure?: number };

export function mirroredPointSets(points: SymmetryPoint[], width: number, height: number, mode: SymmetryMode): SymmetryPoint[][] {
  if (mode === 'none') return [];
  const mirror = (mirrorX: boolean, mirrorY: boolean) => points.map(point => ({
    ...point,
    x: mirrorX ? width - point.x : point.x,
    y: mirrorY ? height - point.y : point.y,
  }));
  const sets: SymmetryPoint[][] = [];
  if (mode === 'vertical' || mode === 'both') sets.push(mirror(true, false));
  if (mode === 'horizontal' || mode === 'both') sets.push(mirror(false, true));
  if (mode === 'both') sets.push(mirror(true, true));
  return sets;
}
