export type SvgExportPoint = { x: number; y: number; pressure?: number };
export type SvgExportStroke = {
  id: string;
  layerId?: string;
  tool: 'brush' | 'eraser';
  shape?: 'line' | 'rectangle' | 'ellipse' | 'text' | 'panel' | 'bubble' | 'image';
  points: SvgExportPoint[];
  color: string;
  size: number;
  text?: string;
  fontFamily?: 'comic' | 'sans' | 'serif';
  filled?: boolean;
  fillColor?: string;
  rotation?: number;
  brushPreset?: 'ink' | 'pencil' | 'marker' | 'airbrush' | 'watercolor' | 'dry-brush' | 'calligraphy';
  imageDataUrl?: string;
  imageName?: string;
};
export type SvgExportLayer = { id: string; name?: string; visible: boolean; opacity: number; blendMode?: string };
export type SvgExportOptions = { width: number; height: number; background: string; transparentBackground?: boolean; strokes: SvgExportStroke[]; layers: SvgExportLayer[] };

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const n = (value: number) => Number.isFinite(value) ? String(Number(value.toFixed(3))) : '0';
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, '-');
const averagePressure = (stroke: SvgExportStroke) => stroke.points.length ? stroke.points.reduce((sum, point) => sum + (point.pressure || 0.5), 0) / stroke.points.length : 0.5;
const presetOpacity = (stroke: SvgExportStroke) => stroke.brushPreset === 'pencil' ? 0.68 : stroke.brushPreset === 'marker' ? 0.46 : stroke.brushPreset === 'airbrush' ? 0.2 : 1;
const presetWidth = (stroke: SvgExportStroke) => stroke.brushPreset === 'pencil' ? 0.82 : stroke.brushPreset === 'marker' ? 1.45 : stroke.brushPreset === 'airbrush' ? 1.8 : 1;

function bounds(stroke: SvgExportStroke) {
  const points = stroke.points;
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const pad = Math.max(6, stroke.size);
  const lines = (stroke.text ?? '').split('\n');
  const textWidth = stroke.shape === 'text' ? Math.max(12, ...lines.map(line => line.length * stroke.size * 0.62)) : 0;
  const textHeight = stroke.shape === 'text' ? lines.length * stroke.size * 1.3 : 0;
  const bubbleWidth = stroke.shape === 'bubble' ? Math.max(8, (maxX - minX) * 0.12) : 0;
  const bubbleHeight = stroke.shape === 'bubble' ? Math.max(8, (maxY - minY) * 0.22) : 0;
  return { x: minX - pad, y: minY - pad, width: Math.max(1, maxX - minX, textWidth) + pad * 2 + bubbleWidth, height: Math.max(1, maxY - minY, textHeight) + pad * 2 + bubbleHeight };
}

function rotateWrap(stroke: SvgExportStroke, content: string) {
  if (!stroke.rotation) return content;
  const box = bounds(stroke);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  return '<g transform="rotate(' + n(stroke.rotation * 180 / Math.PI) + ' ' + n(cx) + ' ' + n(cy) + ')">' + content + '</g>';
}

function pathFor(stroke: SvgExportStroke) {
  return stroke.points.map((point, index) => (index ? 'L ' : 'M ') + n(point.x) + ' ' + n(point.y)).join(' ');
}
function smoothPathFor(stroke: SvgExportStroke) {
  const points = stroke.points;
  if (points.length < 3) return pathFor(stroke);
  let path = 'M ' + n(points[0].x) + ' ' + n(points[0].y);
  for (let i = 1; i < points.length; i++) {
    const point = points[i], next = points[i + 1];
    const end = next ? { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 } : point;
    path += ' Q ' + n(point.x) + ' ' + n(point.y) + ' ' + n(end.x) + ' ' + n(end.y);
  }
  return path;
}

function eraserMaskMark(stroke: SvgExportStroke) {
  if (!stroke.points.length) return '';
  const width = stroke.size * Math.max(0.15, averagePressure(stroke));
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    return '<circle cx="' + n(point.x) + '" cy="' + n(point.y) + '" r="' + n(width / 2) + '" fill="black"/>';
  }
  return '<path d="' + smoothPathFor(stroke) + '" fill="none" stroke="black" stroke-width="' + n(width) + '" stroke-linecap="round" stroke-linejoin="round"/>';
}

function strokeMarkup(stroke: SvgExportStroke) {
  if (!stroke.points.length) return '';
  const first = stroke.points[0], last = stroke.points[stroke.points.length - 1];
  const width = Math.abs(last.x - first.x), height = Math.abs(last.y - first.y);
  const x = Math.min(first.x, last.x), y = Math.min(first.y, last.y);
  const pressure = Math.max(0.15, averagePressure(stroke));
  const lineWidth = stroke.size * pressure * presetWidth(stroke);
  let markup = '';
  if (stroke.shape === 'image' && stroke.imageDataUrl) {
    markup = '<image href="' + esc(stroke.imageDataUrl) + '" x="' + n(x) + '" y="' + n(y) + '" width="' + n(Math.max(1, width)) + '" height="' + n(Math.max(1, height)) + '" preserveAspectRatio="none"/>';
  } else if (stroke.shape === 'text') {
    const family = stroke.fontFamily === 'serif' ? 'Georgia,serif' : stroke.fontFamily === 'sans' ? 'Arial,sans-serif' : 'Trebuchet MS,Comic Sans MS,cursive';
    const lines = (stroke.text ?? '').split('\n');
    markup = '<text dominant-baseline="text-before-edge" x="' + n(first.x) + '" y="' + n(first.y) + '" fill="' + esc(stroke.color) + '" font-family="' + esc(family) + '" font-size="' + n(stroke.size) + '" font-weight="600">' + lines.map((line, index) => '<tspan x="' + n(first.x) + '" dy="' + (index ? n(Math.max(10, stroke.size * 1.25)) : '0') + '">' + esc(line) + '</tspan>').join('') + '</text>';
  } else if (stroke.shape === 'bubble') {
    const fill = esc(stroke.fillColor ?? '#fffdfb');
    const tail = 'M ' + n(x + width * 0.85) + ' ' + n(y + height * 0.85) + ' L ' + n(x + width * 1.12) + ' ' + n(y + height * 1.2) + ' L ' + n(x + width * 0.71) + ' ' + n(y + height * 0.95) + ' Z';
    markup = '<path d="' + tail + '" fill="' + fill + '" stroke="' + esc(stroke.color) + '" stroke-width="' + n(lineWidth) + '" stroke-linejoin="round"/><ellipse cx="' + n(x + width / 2) + '" cy="' + n(y + height / 2) + '" rx="' + n(Math.max(width / 2, 0.01)) + '" ry="' + n(Math.max(height / 2, 0.01)) + '" fill="' + fill + '" stroke="' + esc(stroke.color) + '" stroke-width="' + n(lineWidth) + '"/>';
  } else if (stroke.shape === 'line') {
    markup = '<path d="' + smoothPathFor(stroke) + '" fill="none" stroke="' + esc(stroke.color) + '" stroke-width="' + n(lineWidth) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (stroke.shape === 'rectangle' || stroke.shape === 'panel') {
    const fill = stroke.filled ? esc(stroke.fillColor ?? stroke.color) : 'none';
    const weight = stroke.shape === 'panel' ? Math.max(4, lineWidth) : lineWidth;
    markup = '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(width) + '" height="' + n(height) + '" fill="' + fill + '" stroke="' + esc(stroke.color) + '" stroke-width="' + n(weight) + '"/>';
  } else if (stroke.shape === 'ellipse') {
    const fill = stroke.filled ? esc(stroke.fillColor ?? stroke.color) : 'none';
    markup = '<ellipse cx="' + n(x + width / 2) + '" cy="' + n(y + height / 2) + '" rx="' + n(Math.max(width / 2, 0.01)) + '" ry="' + n(Math.max(height / 2, 0.01)) + '" fill="' + fill + '" stroke="' + esc(stroke.color) + '" stroke-width="' + n(lineWidth) + '"/>';
  } else if (stroke.points.length === 1) {
    markup = '<circle cx="' + n(first.x) + '" cy="' + n(first.y) + '" r="' + n(lineWidth / 2) + '" fill="' + esc(stroke.color) + '" opacity="' + n(presetOpacity(stroke)) + '"/>';
  } else {
    markup = '<path d="' + pathFor(stroke) + '" fill="none" stroke="' + esc(stroke.color) + '" stroke-width="' + n(lineWidth) + '" stroke-opacity="' + n(presetOpacity(stroke)) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  return rotateWrap(stroke, markup);
}

export function buildSvgDocument(options: SvgExportOptions): string {
  const { width, height, background, strokes, layers, transparentBackground = false } = options;
  const visibleLayers = layers.filter(layer => layer.visible);
  const defs: string[] = [];
  const body: string[] = [];
  if (!transparentBackground) body.push('<rect width="100%" height="100%" fill="' + esc(background) + '"/>');
  for (const layer of visibleLayers) {
    const id = 'kuro-layer-' + safeId(layer.id);
    const layerStrokes = strokes.filter(stroke => (stroke.layerId || layers[0]?.id) === layer.id);
    let artwork = '';
    let eraserIndex = 0;
    for (const stroke of layerStrokes) {
      if (stroke.tool === 'eraser') {
        const maskId = id + '-erase-' + eraserIndex++;
        defs.push('<mask id="' + maskId + '-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="' + n(width) + '" height="' + n(height) + '"><rect width="100%" height="100%" fill="white"/>' + eraserMaskMark(stroke) + '</mask>');
        // Mask only what has already been painted so later strokes remain visible, like canvas destination-out.
        artwork = '<g mask="url(#' + maskId + '-mask)">' + artwork + '</g>';
      } else {
        artwork += strokeMarkup(stroke);
      }
    }
    const blend = layer.blendMode && layer.blendMode !== 'normal' ? ' style="mix-blend-mode:' + esc(layer.blendMode) + '"' : '';
    body.push('<g opacity="' + n(layer.opacity ?? 1) + '"' + blend + '>' + artwork + '</g>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + n(width) + '" height="' + n(height) + '" viewBox="0 0 ' + n(width) + ' ' + n(height) + '"><defs>' + defs.join('') + '</defs>' + body.join('') + '</svg>';
}
