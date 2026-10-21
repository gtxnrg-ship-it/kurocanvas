import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Minus, Plus, RotateCcw, RotateCw, Download, Trash2, Hand, Pencil, CircleHelp, Cloud, AlertTriangle, Square, Circle, Type, MousePointer2, Copy, Library, MessageCircle, ImagePlus, History, Pipette } from 'lucide-react';
import { drawingRevisionStorage, drawingStorage, storyMemoryStorage } from '../core/storage';
import { buildSvgDocument } from './svgExport';
import type { LocalDrawingDocument } from '../core/storage';
import { applyCommandsToLocalDrawing } from './localDrawingBridge';
import type { NativeDrawingCommand } from './commands';
import { createDrawingAction, transitionDrawingAction, type DrawingActionRecord } from './actionQueue';
import { createSymmetryCopies, type SymmetryMode } from './symmetry';
import { CANVAS_PRESETS, isValidCanvasDimensions } from './canvasDimensions';
import { addPaletteColor, normalizePalette, removePaletteColor } from './colorPalette';
import { flipStrokeGeometry, type FlipAxis } from './flipArtwork';
import { moveArtworkToLayerEdge, type LayerEdge } from './layerOrdering';
import { applyStrokeAppearance } from './strokeAppearance';
import { drawingGuardSignature } from './drawingGuard';
import { getBrushProfile, pressureWidth, type BrushPreset } from './brushProfiles';

type Tool = 'brush' | 'eraser' | 'pan' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'select' | 'panel' | 'bubble' | 'eyedropper';
type PanelLayoutPreset = 'two-rows' | 'three-columns' | 'grid-2x2' | 'hero-sidebar' | 'webtoon-stack';
type Point = { x: number; y: number; pressure: number };
type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
type Layer = { id: string; name: string; visible: boolean; locked: boolean; opacity: number; blendMode: BlendMode };
type Stroke = { id: string; layerId?: string; tool: 'brush' | 'eraser'; opacity?: number; shape?: 'line' | 'rectangle' | 'ellipse' | 'text' | 'panel' | 'bubble' | 'image'; imageDataUrl?: string; imageName?: string; filled?: boolean; fillColor?: string; text?: string; fontFamily?: 'comic' | 'sans' | 'serif'; rotation?: number; brushPreset?: BrushPreset; color: string; size: number; points: Point[] };
type Doc = { version: 1; width: number; height: number; background: string; strokes: Stroke[] };
type PlanSnapshot = { planId: string; strokes: Stroke[]; layers: Layer[]; background: string; activeLayerId: string };
type SelectionDrag = { pointerX: number; pointerY: number; strokeId: string; startPoints: Point[]; moved: boolean; mode: 'move' | 'resize' | 'rotate'; bounds: { x: number; y: number; width: number; height: number }; center: Point; startAngle: number; startRotation: number };

const COLORS = ['#f7f2ff', '#191522', '#b69aff', '#ff8fb3', '#78e5c6', '#ffca78', '#7ab7ff'];
const PANEL_LAYOUTS: Record<PanelLayoutPreset, Array<[number, number, number, number]>> = {
  'two-rows': [[80, 80, 1520, 580], [80, 620, 1520, 1120]],
  'three-columns': [[80, 80, 540, 1120], [570, 80, 1030, 1120], [1060, 80, 1520, 1120]],
  'grid-2x2': [[80, 80, 780, 580], [820, 80, 1520, 580], [80, 620, 780, 1120], [820, 620, 1520, 1120]],
  'hero-sidebar': [[80, 80, 1040, 1120], [1080, 80, 1520, 540], [1080, 580, 1520, 1120]],
  'webtoon-stack': [[100, 80, 1500, 400], [100, 440, 1500, 760], [100, 800, 1500, 1120]],
};
const imageCache = new Map<string, HTMLImageElement>();
function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read that image file.'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that image file.'));
    reader.readAsDataURL(file);
  });
}
function preloadDrawingImages(strokes: Array<{ shape?: string; imageDataUrl?: string }>): Promise<void> {
  const urls = [...new Set(strokes.filter(stroke => stroke.shape === 'image' && stroke.imageDataUrl).map(stroke => stroke.imageDataUrl!))];
  return Promise.all(urls.map(url => new Promise<void>((resolve, reject) => {
    const cached = imageCache.get(url);
    if (cached?.complete) {
      if (cached.naturalWidth > 0) resolve();
      else reject(new Error('A saved reference image could not be decoded.'));
      return;
    }
    if (cached) {
      cached.addEventListener('load', () => resolve(), { once: true });
      cached.addEventListener('error', () => reject(new Error('A saved reference image could not be decoded.')), { once: true });
      return;
    }
    const image = new Image();
    imageCache.set(url, image);
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('A saved reference image could not be decoded.'));
    image.src = url;
  }))).then(() => undefined);
}
const DEFAULT_LAYER: Layer = { id: 'layer-default', name: 'Sketch', visible: true, locked: false, opacity: 1, blendMode: 'normal' };

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  ctx.save();
  if (stroke.rotation) {
    const bounds = getStrokeBounds(stroke);
    const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
    ctx.translate(cx, cy); ctx.rotate(stroke.rotation); ctx.translate(-cx, -cy);
  }
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  const preset = stroke.brushPreset ?? 'ink';
  const profile = getBrushProfile(preset);
  const widthMultiplier = profile.widthMultiplier;
  ctx.globalAlpha *= profile.opacity * (stroke.opacity ?? 1);
  if (profile.shadowBlurMultiplier > 0) { ctx.shadowColor = stroke.color; ctx.shadowBlur = Math.max(2, stroke.size * profile.shadowBlurMultiplier); }
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = profile.lineCap;
  ctx.lineJoin = profile.lineJoin;
  if (profile.dashRatio > 0) ctx.setLineDash([Math.max(1, stroke.size * profile.dashRatio * 1.5), Math.max(0.75, stroke.size * profile.dashRatio * 0.65)]);
  if (stroke.shape === 'image' && stroke.points.length && stroke.imageDataUrl) {
    const image = imageCache.get(stroke.imageDataUrl);
    if (image?.complete && image.naturalWidth > 0) {
      const start = stroke.points[0], end = stroke.points[stroke.points.length - 1];
      ctx.drawImage(image, Math.min(start.x, end.x), Math.min(start.y, end.y), Math.max(1, Math.abs(end.x - start.x)), Math.max(1, Math.abs(end.y - start.y)));
    }
  } else if (stroke.shape === 'text' && stroke.points.length) {
    const start = stroke.points[0];
    ctx.fillStyle = stroke.color;
    const font = stroke.fontFamily === 'serif' ? 'Georgia, serif' : stroke.fontFamily === 'sans' ? 'Arial, sans-serif' : 'Trebuchet MS, Comic Sans MS, cursive';
    ctx.font = '600 ' + Math.max(8, stroke.size) + 'px ' + font;
    ctx.textBaseline = 'top';
    (stroke.text ?? '').split('\n').forEach((line, index) => ctx.fillText(line, start.x, start.y + index * Math.max(10, stroke.size * 1.25)));
  } else if (stroke.shape && stroke.points.length) {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    ctx.lineWidth = (stroke.shape === 'panel' ? Math.max(4, stroke.size) : stroke.size) * widthMultiplier;
    if (stroke.shape === 'bubble') {
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
      const w = Math.max(1, Math.abs(end.x - start.x)), h = Math.max(1, Math.abs(end.y - start.y));
      const fillColor = stroke.fillColor ?? '#fffdfb';
      // Draw the tail first; the filled ellipse covers the tail's join for a clean balloon seam.
      ctx.beginPath();
      ctx.moveTo(x + w * 0.85, y + h * 0.85);
      ctx.lineTo(x + w * 1.12, y + h * 1.2);
      ctx.lineTo(x + w * 0.71, y + h * 0.95);
      ctx.closePath(); ctx.fillStyle = fillColor; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.01), Math.max(h / 2, 0.01), 0, 0, Math.PI * 2);
      ctx.fillStyle = fillColor; ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      if (stroke.shape === 'line') {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      } else if (stroke.shape === 'rectangle' || stroke.shape === 'panel') {
        ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      } else {
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
      }
      if (stroke.filled && stroke.shape !== 'line') ctx.fill();
      ctx.stroke();
    }
  } else if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, pressureWidth(p.pressure, stroke.size, preset), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const points = stroke.points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const start = i === 1 ? points[0] : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = points[i + 1];
      const end = next ? { x: (b.x + next.x) / 2, y: (b.y + next.y) / 2 } : b;
      const pressure = Math.max(0.15, ((a.pressure || 0.5) + (b.pressure || 0.5)) / 2);
      ctx.beginPath();
      ctx.lineWidth = pressureWidth(pressure, stroke.size, preset);
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(b.x, b.y, end.x, end.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function getStrokeBounds(stroke: Stroke) {
  const points = stroke.points;
  const pad = Math.max(6, stroke.size);
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const textLines = (stroke.text ?? '').split('\n');
  const textWidth = stroke.shape === 'text' ? Math.max(12, ...textLines.map(line => line.length * stroke.size * 0.62)) : 0;
  const textHeight = stroke.shape === 'text' ? textLines.length * stroke.size * 1.3 : 0;
  const bubbleWidth = stroke.shape === 'bubble' ? Math.max(8, (maxX - minX) * 0.12) : 0;
  const bubbleHeight = stroke.shape === 'bubble' ? Math.max(8, (maxY - minY) * 0.22) : 0;
  return { x: minX - pad, y: minY - pad, width: Math.max(1, maxX - minX, textWidth) + pad * 2 + bubbleWidth, height: Math.max(1, maxY - minY, textHeight) + pad * 2 + bubbleHeight };
}

function createSurface(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  return surface;
}

type PendingCanvasPlan = { id: string; commands: NativeDrawingCommand[]; expectedDocumentSignature: string; expectedDocumentWasSaved: boolean } | null;
export default function DrawingCanvas({ pendingPlan = null, onPlanResult, projectId = '', requestedDrawingId = '', onDrawingOpened }: { pendingPlan?: PendingCanvasPlan; onPlanResult?: (id: string, result: 'success' | 'error' | 'cancelled', message: string) => void; projectId?: string; requestedDrawingId?: string; onDrawingOpened?: (drawingId: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const layerSurfaceRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Stroke | null>(null);
  const panRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const selectionDragRef = useRef<SelectionDrag | null>(null);
  const moveSnapshotRef = useRef<Stroke[] | null>(null);
  const docRef = useRef<Doc>({ version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] });
  const pendingNewDocRef = useRef<{ id: string; doc: Doc } | null>(null);
  const [documents, setDocuments] = useState<Array<{id:string;name?:string;updatedAt:string}>>([]);
  const [revisions, setRevisions] = useState<Array<{id:string;title:string;createdAt:string}>>([]);
  const [drawingId, setDrawingId] = useState('default-canvas-v1');
  const [drawingName, setDrawingName] = useState('My first sketch');
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(COLORS[2]);
  const [customColors, setCustomColors] = useState<string[]>(() => {
    try { const saved = localStorage.getItem('kuro-canvas-custom-colors-v1'); return normalizePalette(saved ? JSON.parse(saved) : []); }
    catch { return []; }
  });
  const [size, setSize] = useState(6);
  const [strokeOpacity, setStrokeOpacity] = useState(100);
  const [textDraft, setTextDraft] = useState('');
  const [letteringFont, setLetteringFont] = useState<'comic'|'sans'|'serif'>('comic');
  const [brushPreset, setBrushPreset] = useState<BrushPreset>('ink');
  const [stabilizer, setStabilizer] = useState(0);
  const [symmetryMode, setSymmetryMode] = useState<SymmetryMode>('off');
  const [panelLayout, setPanelLayout] = useState<PanelLayoutPreset>('two-rows');
  const [fillShapes, setFillShapes] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [layers, setLayers] = useState<Layer[]>([DEFAULT_LAYER]);
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER.id);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [editUndoStack, setEditUndoStack] = useState<Stroke[][]>([]);
  const [editRedoStack, setEditRedoStack] = useState<Stroke[][]>([]);
  const [historyOrder, setHistoryOrder] = useState<Array<'edit'|'plan'>>([]);
  const [redoOrder, setRedoOrder] = useState<Array<'edit'|'plan'>>([]);
  const [planUndoStack, setPlanUndoStack] = useState<PlanSnapshot[]>([]);
  const [planRedoStack, setPlanRedoStack] = useState<PlanSnapshot[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [background, setBackground] = useState('#fffdfb');
  const [showGrid, setShowGrid] = useState(false);
  const [transparentExport, setTransparentExport] = useState(false);
  const [exportScale, setExportScale] = useState<1 | 1.5 | 2>(1);
  const [notice, setNotice] = useState('Ready to draw · Pressure-aware pointer input');
  useEffect(() => { try { localStorage.setItem('kuro-canvas-custom-colors-v1', JSON.stringify(customColors)); } catch { /* Palette persistence is optional in restricted browser contexts. */ } }, [customColors]);
  const [showHelp, setShowHelp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<'loading'|'saved'|'saving'|'error'>('loading');
  const [planAction, setPlanAction] = useState<DrawingActionRecord | null>(null);
  const [planRunNonce, setPlanRunNonce] = useState(0);
  const handledPlanRef = useRef<string | null>(null);
  const [planProgress, setPlanProgress] = useState<{ completed: number; total: number; command: string } | null>(null);
  const cancelPlanExecutionRef = useRef<(() => void) | null>(null);

  const render = useCallback((nextStrokes: Stroke[] = docRef.current.strokes, bg = docRef.current.background) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const pixelWidth = Math.round(w * dpr), pixelHeight = Math.round(h * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Each layer gets its own transparent surface. destination-out therefore only
    // erases pixels on that layer, never artwork drawn on a different layer.
    const sx = w / docRef.current.width, sy = h / docRef.current.height;
    // Reuse one scratch surface rather than allocating a full-size canvas for
    // every layer on every pointer move. This limits transient canvas memory and
    // garbage collection pressure on phones/tablets with many layers.
    const surface = layerSurfaceRef.current ?? createSurface(docRef.current.width, docRef.current.height);
    if (!surface) return;
    if (surface.width !== docRef.current.width || surface.height !== docRef.current.height) {
      surface.width = docRef.current.width;
      surface.height = docRef.current.height;
    }
    layerSurfaceRef.current = surface;
    const layerCtx = surface.getContext('2d');
    if (!layerCtx) return;
    for (const layer of layers) {
      if (!layer.visible) continue;
      layerCtx.clearRect(0, 0, surface.width, surface.height);
      for (const stroke of nextStrokes) {
        const strokeLayerId = stroke.layerId || layers[0]?.id;
        if (strokeLayerId === layer.id) drawStroke(layerCtx, stroke);
      }
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation = layer.blendMode === 'normal' || !layer.blendMode ? 'source-over' : layer.blendMode;
      ctx.scale(sx, sy);
      ctx.drawImage(surface, 0, 0);
      ctx.restore();
    }
  }, [layers]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => render());
    observer.observe(wrap);
    render();
    return () => observer.disconnect();
  }, [render]);


  const refreshRevisions = useCallback(async () => {
    try { setRevisions(await drawingRevisionStorage.list(drawingId)); }
    catch (error) { setNotice('Could not load drawing versions: ' + (error instanceof Error ? error.message : 'unknown error')); }
  }, [drawingId]);
  useEffect(() => { void refreshRevisions(); }, [refreshRevisions]);

  const createVersionCheckpoint = async () => {
    if (!loaded || loadError) { setNotice('Wait until this drawing is safely loaded before creating a version.'); return; }
    const defaultTitle = 'Checkpoint · ' + new Date().toLocaleString();
    const title = globalThis.prompt('Name this recoverable drawing version', defaultTitle);
    if (!title?.trim()) return;
    try {
      const document: LocalDrawingDocument = {
        id: drawingId, projectId, name: drawingName, version: 1, width: docRef.current.width, height: docRef.current.height,
        background, strokes: JSON.parse(JSON.stringify(strokes)), layers: layers.map(layer => ({ ...layer })), updatedAt: new Date().toISOString(),
      };
      await drawingStorage.save(document);
      await drawingRevisionStorage.create(drawingId, title.trim(), document);
      await refreshRevisions();
      setNotice('Saved version "' + title.trim() + '". Up to 20 named checkpoints are kept per drawing.');
    } catch (error) {
      setNotice('Could not save a drawing version: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  };

  const restoreVersionCheckpoint = async (revisionId: string, title: string) => {
    if (!globalThis.confirm('Restore "' + title + '"? Your current drawing will be saved as a new checkpoint first.')) return;
    try {
      const revision = await drawingRevisionStorage.load(revisionId, drawingId);
      if (!revision) throw new Error('That version no longer exists for this drawing.');
      const current: LocalDrawingDocument = {
        id: drawingId, projectId, name: drawingName, version: 1, width: docRef.current.width, height: docRef.current.height,
        background, strokes: JSON.parse(JSON.stringify(strokes)), layers: layers.map(layer => ({ ...layer })), updatedAt: new Date().toISOString(),
      };
      await drawingStorage.save(current);
      await drawingRevisionStorage.create(drawingId, 'Before restore · ' + new Date().toLocaleString(), current);
      await preloadDrawingImages(revision.document.strokes as Stroke[]);
      const restored = { ...revision.document, id: drawingId, projectId, name: drawingName, updatedAt: new Date().toISOString() };
      await drawingStorage.save(restored);
      const restoredStrokes = restored.strokes as Stroke[];
      const restoredLayers = (restored.layers?.length ? restored.layers : [DEFAULT_LAYER]).map(layer => ({ ...layer, opacity: layer.opacity ?? 1, blendMode: (layer.blendMode ?? 'normal') as BlendMode }));
      docRef.current = { version: 1, width: restored.width, height: restored.height, background: restored.background, strokes: restoredStrokes };
      setStrokes(restoredStrokes); setLayers(restoredLayers); setBackground(restored.background);
      setActiveLayerId(restoredLayers.find(layer => !layer.locked)?.id || restoredLayers[0].id);
      setSelectedStrokeId(null); setRedoStack([]); setEditUndoStack([]); setEditRedoStack([]); setPlanUndoStack([]); setPlanRedoStack([]); setHistoryOrder([]); setRedoOrder([]);
      await refreshRevisions();
      setNotice('Restored "' + title + '". A checkpoint of the previous state was saved first.');
    } catch (error) {
      setNotice('Could not restore that version: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  };

  const refreshDocuments = useCallback(async () => {
    try { setDocuments(await drawingStorage.list(projectId)); }
    catch (error) { setNotice('Could not list local drawings: ' + (error instanceof Error ? error.message : 'unknown error')); }
  }, [projectId]);
  useEffect(() => { void refreshDocuments(); }, [refreshDocuments]);

  useEffect(() => {
    let cancelled = false;
    // History belongs to one document only; never replay another drawing's snapshots here.
    setRedoStack([]); setPlanUndoStack([]); setPlanRedoStack([]); setEditUndoStack([]); setEditRedoStack([]); setHistoryOrder([]); setRedoOrder([]); setSelectedStrokeId(null);
    setLoaded(false); setLoadError(false); setSaveState('loading');
    drawingStorage.load(drawingId, projectId).then(async saved => {
      if (saved) await preloadDrawingImages(saved.strokes as Stroke[]);
      if (cancelled) return;
      if (saved) {
        const doc: LocalDrawingDocument = saved;
        const nextLayers: Layer[] = doc.layers?.length ? doc.layers.map(layer => ({ ...layer, opacity: layer.opacity ?? 1, blendMode: layer.blendMode ?? 'normal' })) : [DEFAULT_LAYER];
        docRef.current = { version: 1, width: doc.width, height: doc.height, background: doc.background, strokes: doc.strokes };
        setStrokes(doc.strokes); setLayers(nextLayers);
        setActiveLayerId(nextLayers.find(layer => !layer.locked)?.id || nextLayers[0].id);
        setBackground(doc.background); setDrawingName(doc.name || 'Untitled drawing');
        setNotice('Opened ' + (doc.name || 'saved drawing'));
      } else {
        const pending = pendingNewDocRef.current?.id === drawingId ? pendingNewDocRef.current.doc : null;
        if (pendingNewDocRef.current?.id === drawingId) pendingNewDocRef.current = null;
        docRef.current = pending ?? { version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] };
        setStrokes([]); setRedoStack([]); setPlanUndoStack([]); setPlanRedoStack([]); setLayers([DEFAULT_LAYER]); setActiveLayerId(DEFAULT_LAYER.id);
        setBackground('#fffdfb');
        setNotice('New canvas · Drawings save automatically on this device');
      }
      setLoaded(true); setSaveState('saved'); onDrawingOpened?.(drawingId);
    }).catch(error => {
      if (cancelled) return;
      if (drawingId === 'default-canvas-v1' && !requestedDrawingId && error instanceof Error && error.message.includes('Universe isolation violation')) {
        setDrawingId(crypto.randomUUID());
        return;
      }
      setLoaded(true); setLoadError(true); setSaveState('error');
      setNotice('Local storage unavailable: ' + (error instanceof Error ? error.message : 'unknown error'));
    });
    return () => { cancelled = true; };
  }, [drawingId, projectId]);

  useEffect(() => {
    docRef.current = { ...docRef.current, strokes, background };
    render(strokes, background);
    if (!loaded || loadError || planAction?.status === 'running') return;
    setSaveState('saving');
    const timer = globalThis.setTimeout(() => {
      drawingStorage.save({
        id: drawingId, projectId, name: drawingName, version: 1, width: docRef.current.width, height: docRef.current.height,
        background: docRef.current.background, strokes: docRef.current.strokes, layers, updatedAt: new Date().toISOString(),
      }).then(() => {
        setSaveState(current => current === 'saving' ? 'saved' : current);
        void refreshDocuments();
      }).catch(error => {
        setSaveState('error');
        setNotice('Autosave failed: ' + (error instanceof Error ? error.message : 'unknown error'));
      });
    }, 450);
    return () => globalThis.clearTimeout(timer);
  }, [strokes, background, layers, loaded, loadError, render, drawingId, drawingName, refreshDocuments, planAction]);

  useEffect(() => {
    const runKey = pendingPlan ? pendingPlan.id + ':' + planRunNonce : '';
    if (!pendingPlan || !loaded || !onPlanResult || handledPlanRef.current === runKey) return;
    handledPlanRef.current = runKey;
    const queued = createDrawingAction({ id: runKey, title: 'Apply approved drawing plan', description: pendingPlan.commands.length + ' native drawing command(s)', commandId: pendingPlan.id, requiresApproval: false });
    const running = transitionDrawingAction(queued, { type: 'execution.start', actionId: runKey });
    setPlanAction(running);
    setPlanProgress({ completed: 0, total: pendingPlan.commands.length, command: 'Preparing native tools' });
    let cancelled = false;
    let userCancelled = false;
    let workingDocument: LocalDrawingDocument | undefined;
    let originalDocument: LocalDrawingDocument | undefined;
    const cancel = () => { cancelled = true; userCancelled = true; };
    cancelPlanExecutionRef.current = cancel;

    let preserveNewerDocument = false;
    const loadStoredCanvasIntoView = async (saved: LocalDrawingDocument) => {
      await preloadDrawingImages(saved.strokes as Stroke[]);
      const savedStrokes = saved.strokes as Stroke[];
      const savedLayers = (saved.layers?.length ? saved.layers : [DEFAULT_LAYER]).map(layer => ({
        ...layer, opacity: layer.opacity ?? 1, blendMode: (layer.blendMode ?? 'normal') as BlendMode,
      }));
      docRef.current = { version: 1, width: saved.width, height: saved.height, background: saved.background, strokes: savedStrokes };
      setStrokes(savedStrokes);
      setLayers(savedLayers);
      setActiveLayerId(savedLayers.find(layer => !layer.locked)?.id || savedLayers[0]?.id || DEFAULT_LAYER.id);
      setBackground(saved.background);
      setDrawingName(saved.name || 'Untitled drawing');
    };

    const restoreOriginal = async () => {
      if (!workingDocument || !originalDocument) return;
      let latestSaved: LocalDrawingDocument | undefined;
      try {
        latestSaved = await drawingStorage.load(drawingId, projectId);
      } catch (error) {
        preserveNewerDocument = true;
        throw new Error('Could not verify the latest saved canvas, so rollback was skipped to avoid overwriting possible newer work. ' + (error instanceof Error ? error.message : 'Unknown storage error.'));
      }
      if (!latestSaved || drawingGuardSignature(latestSaved) !== drawingGuardSignature(workingDocument)) {
        preserveNewerDocument = true;
        if (latestSaved) await loadStoredCanvasIntoView(latestSaved);
        throw new Error('The canvas changed or was removed elsewhere. Automatic rollback was skipped to preserve newer saved work.');
      }
      try {
        await drawingStorage.compareAndSave(workingDocument, originalDocument);
      } catch (error) {
        preserveNewerDocument = true;
        throw new Error('The canvas changed while rollback was starting. The newer saved state was preserved. ' + (error instanceof Error ? error.message : 'Unknown rollback error.'));
      }
      const restored = await drawingStorage.load(originalDocument.id, originalDocument.projectId);
      if (!restored || drawingGuardSignature(restored) !== drawingGuardSignature(originalDocument)) {
        preserveNewerDocument = true;
        if (restored) await loadStoredCanvasIntoView(restored);
        throw new Error('The original artwork could not be verified after atomic rollback.');
      }
      workingDocument = restored;
      originalDocument = restored;
      await loadStoredCanvasIntoView(restored);
    };

    (async () => {
      try {
        const beforePlan: PlanSnapshot = {
          planId: pendingPlan.id,
          strokes: docRef.current.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })),
          layers: layers.map(layer => ({ ...layer })),
          background: docRef.current.background,
          activeLayerId,
        };
        const current: LocalDrawingDocument = {
          id: drawingId, projectId, name: drawingName, version: 1, width: docRef.current.width,
          height: docRef.current.height, background: docRef.current.background,
          strokes: docRef.current.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })),
          layers: layers.map(layer => ({ ...layer })), updatedAt: new Date().toISOString(),
        };
        if (drawingGuardSignature(current) !== pendingPlan.expectedDocumentSignature) {
          throw new Error('This canvas changed after Kuro prepared the plan. Nothing was applied. Return to chat, inspect the latest canvas, and ask Kuro for a fresh proposal.');
        }
        let latestAtStart: LocalDrawingDocument | undefined;
        try {
          latestAtStart = await drawingStorage.load(drawingId, projectId);
        } catch (error) {
          preserveNewerDocument = true;
          throw new Error('Could not verify the latest saved canvas. Kuro stopped before drawing to protect existing work. ' + (error instanceof Error ? error.message : 'Unknown storage error.'));
        }
        if (pendingPlan.expectedDocumentWasSaved && !latestAtStart) {
          preserveNewerDocument = true;
          throw new Error('The saved canvas was deleted after Kuro prepared this plan. Kuro will not recreate it automatically.');
        }
        if (!pendingPlan.expectedDocumentWasSaved && latestAtStart) {
          preserveNewerDocument = true;
          await loadStoredCanvasIntoView(latestAtStart);
          throw new Error('A canvas with this ID appeared after Kuro prepared the plan. The existing document was left untouched.');
        }
        if (latestAtStart && drawingGuardSignature(latestAtStart) !== drawingGuardSignature(current)) {
          preserveNewerDocument = true;
          await loadStoredCanvasIntoView(latestAtStart);
          throw new Error('The saved canvas changed after inspection. Kuro stopped before drawing and reloaded the newer version.');
        }
        if (!latestAtStart && current.strokes.length > 0) {
          preserveNewerDocument = true;
          throw new Error('The previously saved artwork is missing from storage. Kuro did not recreate or overwrite the missing document.');
        }
        // Initialize a genuinely new blank canvas only if this ID is still absent.
        if (!latestAtStart) {
          await drawingStorage.compareAndSave(undefined, current);
          latestAtStart = await drawingStorage.load(drawingId, projectId);
          if (!latestAtStart || drawingGuardSignature(latestAtStart) !== pendingPlan.expectedDocumentSignature) {
            preserveNewerDocument = true;
            throw new Error('The new canvas could not be initialized and verified safely.');
          }
        }
        originalDocument = latestAtStart ?? current;
        workingDocument = originalDocument;
        await drawingRevisionStorage.create(drawingId, 'Before Kuro plan · ' + new Date().toLocaleString(), originalDocument);
        if (cancelled) { await restoreOriginal(); return; }

        let anyChanged = false;
        for (let index = 0; index < pendingPlan.commands.length; index++) {
          if (cancelled) break;
          const command = pendingPlan.commands[index];
          const previousStep = workingDocument!;
          const latestSaved = await drawingStorage.load(drawingId, projectId);
          if (!latestSaved || drawingGuardSignature(latestSaved) !== drawingGuardSignature(previousStep)) {
            preserveNewerDocument = true;
            if (latestSaved) await loadStoredCanvasIntoView(latestSaved);
            throw new Error('The canvas changed or was removed while Kuro was drawing. Execution stopped and rollback was skipped to protect newer work.');
          }
          const step = applyCommandsToLocalDrawing(previousStep, [command]);
          if (step.changed) {
            // Persist and read back each native action before moving to the next one.
            // The canvas therefore visibly progresses, and a failed step can roll the
            // entire plan back to the checkpoint rather than leave half-finished art.
            try {
              await drawingStorage.compareAndSave(previousStep, step.document);
            } catch (error) {
              const reason = error instanceof Error ? error.message : '';
              if (reason.includes('changed in storage since this step')) {
                preserveNewerDocument = true;
                const latestAfterConflict = await drawingStorage.load(drawingId, projectId).catch(() => undefined);
                if (latestAfterConflict) await loadStoredCanvasIntoView(latestAfterConflict);
              }
              throw error;
            }
            const persistedStep = await drawingStorage.load(drawingId, projectId);
            if (!persistedStep || drawingGuardSignature(persistedStep) !== drawingGuardSignature(step.document)) {
              preserveNewerDocument = true;
              if (persistedStep) await loadStoredCanvasIntoView(persistedStep);
              throw new Error('The saved result changed during read-back. The newer saved state was preserved.');
            }
            workingDocument = persistedStep;
            anyChanged = true;
            const nextStrokes = step.document.strokes as Stroke[];
            const nextLayers = (step.document.layers?.length ? step.document.layers : [DEFAULT_LAYER]).map(layer => ({
              ...layer, opacity: layer.opacity ?? 1, blendMode: (layer.blendMode ?? 'normal') as BlendMode,
            }));
            docRef.current = { ...docRef.current, background: step.document.background, strokes: nextStrokes };
            setStrokes(nextStrokes);
            setLayers(nextLayers);
            if (command.type === 'layer.add') {
              setActiveLayerId(command.layerId);
            } else if (command.type === 'layer.remove') {
              setActiveLayerId(currentId => currentId === command.layerId
                ? nextLayers.find(layer => !layer.locked)?.id || nextLayers[0]?.id || DEFAULT_LAYER.id
                : currentId);
            }
            setBackground(step.document.background);
            setRedoStack([]);
          }
          setPlanProgress({ completed: index + 1, total: pendingPlan.commands.length, command: command.type.replace(/\\./g, ' ') });
          setNotice('Kuro drawing in real time · native action ' + (index + 1) + ' of ' + pendingPlan.commands.length + ' · ' + command.type);
          // Yield to the renderer between native actions so the creator sees live
          // progress instead of a single frame appearing only after the whole plan.
          await new Promise<void>(resolve => globalThis.setTimeout(resolve, 24));
          if (cancelled) break;
        }

        if (cancelled) {
          try {
            await restoreOriginal();
            setPlanProgress(null);
            setSaveState('saved');
            setNotice('Drawing stopped; the original canvas was restored and verified.');
            if (userCancelled) {
              setPlanAction(transitionDrawingAction(running, { type: 'execution.cancel', actionId: runKey }));
              onPlanResult(pendingPlan.id, 'cancelled', 'Cancelled by the creator; original drawing restored and verified.');
            }
          } catch (restoreError) {
            const reason = restoreError instanceof Error ? restoreError.message : 'Unknown recovery error';
            setSaveState('error');
            setNotice('Drawing stopped, but restoring the original canvas could not be verified: ' + reason + '. The pre-plan version checkpoint remains available.');
            if (userCancelled) onPlanResult(pendingPlan.id, 'error', 'Cancellation recovery failed: ' + reason);
          }
          return;
        }
        if (!anyChanged) throw new Error('The plan contained no applicable changes.');
        const finalReadback = await drawingStorage.load(drawingId, projectId);
        const expected = workingDocument!;
        if (!finalReadback || finalReadback.id !== expected.id || finalReadback.projectId !== expected.projectId
          || drawingGuardSignature(finalReadback) !== drawingGuardSignature(expected)) {
          preserveNewerDocument = true;
          if (finalReadback) await loadStoredCanvasIntoView(finalReadback);
          throw new Error('The completed native drawing did not match its final saved readback. The current saved state was preserved.');
        }
        setPlanProgress(null);
        setPlanUndoStack(old => [...old, beforePlan]);
        setPlanRedoStack([]);
        setHistoryOrder(old => [...old, 'plan']);
        setRedoOrder([]);
        setEditRedoStack([]);
        setSaveState('saved');
        setNotice('Kuro finished drawing · ' + pendingPlan.commands.length + ' native actions applied and saved');
        setPlanAction(transitionDrawingAction(running, { type: 'execution.complete', actionId: runKey }));
        onPlanResult(pendingPlan.id, 'success', 'Applied progressively; every changed step and the final editable document were read back and verified in local storage.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown drawing error';
        let recoveryMessage = '';
        try {
          if (preserveNewerDocument) {
            recoveryMessage = ' Newer saved work was preserved; automatic rollback was skipped.';
          } else if (workingDocument && originalDocument) {
            await restoreOriginal();
            recoveryMessage = ' The original canvas was restored and verified.';
          }
        } catch (restoreError) {
          recoveryMessage = preserveNewerDocument
            ? ' Newer saved work was preserved; rollback was skipped.'
            : ' Automatic rollback could not be verified: ' + (restoreError instanceof Error ? restoreError.message : 'unknown recovery error') + '. Use the pre-plan version checkpoint.';
        }
        if (!cancelled) {
          setPlanProgress(null);
          setNotice('AI drawing failed: ' + message + recoveryMessage);
          setPlanAction(transitionDrawingAction(running, { type: 'execution.fail', actionId: runKey, error: message + recoveryMessage }));
          onPlanResult(pendingPlan.id, 'error', message + recoveryMessage);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (cancelPlanExecutionRef.current === cancel) cancelPlanExecutionRef.current = null;
    };
  }, [pendingPlan, loaded, onPlanResult, drawingId, drawingName, planRunNonce]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * docRef.current.width, y: ((e.clientY - rect.top) / rect.height) * docRef.current.height, pressure: e.pressure > 0 ? e.pressure : 0.5 };
  };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'eyedropper') {
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = e.currentTarget.width / Math.max(1, rect.width);
      const scaleY = e.currentTarget.height / Math.max(1, rect.height);
      const pixelX = Math.round((e.clientX - rect.left) * scaleX);
      const pixelY = Math.round((e.clientY - rect.top) * scaleY);
      const ctx = e.currentTarget.getContext('2d', { willReadFrequently: true });
      if (!ctx) { setNotice('Color sampling is unavailable in this browser.'); return; }
      try {
        const pixel = ctx.getImageData(Math.max(0, Math.min(e.currentTarget.width - 1, pixelX)), Math.max(0, Math.min(e.currentTarget.height - 1, pixelY)), 1, 1).data;
        if (pixel[3] === 0) { setNotice('That pixel is transparent; the selected color was not changed.'); return; }
        const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, '0')).join('');
        setColor(hex);
        setTool('brush');
        setNotice('Sampled ' + hex.toUpperCase() + ' from the visible canvas.');
      } catch {
        setNotice('Could not sample this pixel. Try a visible mark on the canvas.');
      }
      return;
    }
    if (tool === 'pan') {
      e.currentTarget.setPointerCapture(e.pointerId);
      panRef.current = { pointerX: e.clientX, pointerY: e.clientY, originX: panOffset.x, originY: panOffset.y };
      setNotice('Drag to move the canvas · zoom controls remain available');
      return;
    }
    if (tool === 'select') {
      const at = pointFromEvent(e);
      const selectedCandidate = selectedStrokeId ? strokes.find(stroke => stroke.id === selectedStrokeId) : undefined;
      const selectedLayer = selectedCandidate ? layers.find(item => item.id === (selectedCandidate.layerId || layers[0]?.id)) : undefined;
      const selected = selectedCandidate && !selectedLayer?.locked && selectedLayer?.visible !== false ? selectedCandidate : undefined;
      const selectedBounds = selected ? getStrokeBounds(selected) : undefined;
      const radius = Math.max(8, 14 * docRef.current.width / Math.max(1, e.currentTarget.getBoundingClientRect().width));
      const selectedCenter = selectedBounds ? { x: selectedBounds.x + selectedBounds.width / 2, y: selectedBounds.y + selectedBounds.height / 2 } : undefined;
      let mode: SelectionDrag['mode'] = 'move';
      let target: Stroke | undefined;
      if (selected && selectedBounds && selectedCenter) {
        const rotation = selected.rotation ?? 0;
        const ux = at.x - selectedCenter.x, uy = at.y - selectedCenter.y;
        const localAt = { x: selectedCenter.x + ux * Math.cos(rotation) + uy * Math.sin(rotation), y: selectedCenter.y - ux * Math.sin(rotation) + uy * Math.cos(rotation) };
        const rotateHandle = { x: selectedCenter.x, y: selectedBounds.y - radius * 1.25 };
        const resizeHandle = { x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y + selectedBounds.height };
        const rotateDistance = Math.hypot(localAt.x - rotateHandle.x, localAt.y - rotateHandle.y);
        const resizeDistance = Math.hypot(localAt.x - resizeHandle.x, localAt.y - resizeHandle.y);
        if (rotateDistance <= radius) { target = selected; mode = 'rotate'; }
        else if (resizeDistance <= radius) { target = selected; mode = 'resize'; }
      }
      if (!target) target = [...strokes].reverse().find(stroke => {
        const layer = layers.find(item => item.id === (stroke.layerId || layers[0]?.id));
        if (layer?.locked || layer?.visible === false) return false;
        const bounds = getStrokeBounds(stroke);
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, pressure: 0.5 };
        const angle = stroke.rotation ?? 0, dx = at.x - center.x, dy = at.y - center.y;
        const local = { x: center.x + dx * Math.cos(angle) + dy * Math.sin(angle), y: center.y - dx * Math.sin(angle) + dy * Math.cos(angle) };
        return local.x >= bounds.x && local.x <= bounds.x + bounds.width && local.y >= bounds.y && local.y <= bounds.y + bounds.height;
      });
      if (!target) { setSelectedStrokeId(null); setNotice('Tap an unlocked object to select it. Drag inside to move; use the top handle to rotate and corner handle to resize.'); return; }
      const bounds = getStrokeBounds(target);
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, pressure: 0.5 };
      if (target.id !== selectedStrokeId) mode = 'move';
      setSelectedStrokeId(target.id); e.currentTarget.setPointerCapture(e.pointerId);
      selectionDragRef.current = { pointerX: e.clientX, pointerY: e.clientY, strokeId: target.id, startPoints: target.points.map(point => ({ ...point })), moved: false, mode, bounds, center, startAngle: Math.atan2(at.y - center.y, at.x - center.x), startRotation: target.rotation ?? 0 };
      moveSnapshotRef.current = strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));
      setNotice(mode === 'rotate' ? 'Drag to rotate the selected object' : mode === 'resize' ? 'Drag the corner to resize the selected object' : 'Drag to move the selected drawing object'); return;
    }
    if (layers.find(layer => layer.id === activeLayerId)?.locked) { setNotice('This layer is locked. Select an unlocked layer to draw.'); return; }
    if (tool === 'text') {
      if (!textDraft.trim()) { setNotice('Type your lettering in the toolbar, then tap the canvas to place it.'); return; }
      const at = pointFromEvent(e);
      const lettering: Stroke = { id: crypto.randomUUID(), layerId: activeLayerId, tool: 'brush', shape: 'text', text: textDraft, fontFamily: letteringFont, color, opacity: strokeOpacity / 100, size: Math.max(12, size * 2), points: [at] };
      moveSnapshotRef.current = strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));
      const beforeText = moveSnapshotRef.current;
      if (beforeText) setEditUndoStack(old => [...old, beforeText]);
      setEditRedoStack([]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setPlanRedoStack([]);
      setStrokes(old => [...old, lettering]); setRedoStack([]); moveSnapshotRef.current = null; setNotice('Text object placed · undo is available'); return;
    }
    moveSnapshotRef.current = strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = pointFromEvent(e);
    activeRef.current = { id: crypto.randomUUID(), layerId: activeLayerId, tool: tool === 'eraser' ? 'eraser' : 'brush', shape: tool === 'line' || tool === 'rectangle' || tool === 'ellipse' || tool === 'panel' || tool === 'bubble' ? tool : undefined, filled: fillShapes && (tool === 'rectangle' || tool === 'ellipse'), fillColor: tool === 'bubble' ? '#fffdfb' : undefined, brushPreset: tool === 'brush' ? brushPreset : undefined, color, opacity: strokeOpacity / 100, size, points: [start] };
    render([...strokes, activeRef.current], background);
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) {
      const pan = panRef.current;
      setPanOffset({ x: pan.originX + e.clientX - pan.pointerX, y: pan.originY + e.clientY - pan.pointerY });
      return;
    }
    if (selectionDragRef.current) {
      const drag = selectionDragRef.current;
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = ((e.clientX - drag.pointerX) / Math.max(1, rect.width)) * docRef.current.width;
      const dy = ((e.clientY - drag.pointerY) / Math.max(1, rect.height)) * docRef.current.height;
      if (Math.abs(dx) + Math.abs(dy) > 0.25) drag.moved = true;
      const at = pointFromEvent(e);
      let points: Point[] = drag.startPoints.map(point => ({ ...point }));
      let rotation: number | undefined;
      if (drag.mode === 'move') {
        points = drag.startPoints.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }));
      } else if (drag.mode === 'resize') {
        const angle = drag.startRotation;
        const localDx = dx * Math.cos(angle) + dy * Math.sin(angle);
        const localDy = -dx * Math.sin(angle) + dy * Math.cos(angle);
        const sx = Math.max(0.03, (drag.bounds.width + localDx) / Math.max(1, drag.bounds.width));
        const sy = Math.max(0.03, (drag.bounds.height + localDy) / Math.max(1, drag.bounds.height));
        points = drag.startPoints.map(point => {
          const x = point.x - drag.bounds.x, y = point.y - drag.bounds.y;
          return { ...point, x: drag.bounds.x + x * sx, y: drag.bounds.y + y * sy };
        });
      } else {
        const angle = Math.atan2(at.y - drag.center.y, at.x - drag.center.x) - drag.startAngle;
        rotation = drag.startRotation + angle;
      }
      setStrokes(old => old.map(stroke => stroke.id === drag.strokeId ? { ...stroke, points, ...(rotation !== undefined ? { rotation } : {}) } : stroke));
      return;
    }
    if (!activeRef.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const active = activeRef.current;
    for (const ev of events) {
      const rect = e.currentTarget.getBoundingClientRect();
      const raw = { x: ((ev.clientX - rect.left) / rect.width) * docRef.current.width, y: ((ev.clientY - rect.top) / rect.height) * docRef.current.height, pressure: ev.pressure > 0 ? ev.pressure : 0.5 };
      const previous = active.points[active.points.length - 1];
      const strength = active.shape === undefined ? (stabilizer / 10) * 0.72 : 0;
      active.points.push({ x: previous.x + (raw.x - previous.x) * (1 - strength), y: previous.y + (raw.y - previous.y) * (1 - strength), pressure: raw.pressure });
    }
    render([...strokes, active], background);
  };
  const pointerUp = () => {
    if (panRef.current) { panRef.current = null; return; }
    if (selectionDragRef.current) {
      const drag = selectionDragRef.current; selectionDragRef.current = null;
      const beforeMove = moveSnapshotRef.current;
      if (drag.moved && beforeMove) { setEditUndoStack(old => [...old, beforeMove]); setEditRedoStack([]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setRedoStack([]); setPlanRedoStack([]); setNotice((drag.mode === 'move' ? 'Object moved' : drag.mode === 'resize' ? 'Object resized' : 'Object rotated') + ' · Undo is available'); }
      moveSnapshotRef.current = null; return;
    }
    if (!activeRef.current) return;
    const completedStroke = activeRef.current!;
    const completedMarks = createSymmetryCopies(completedStroke, docRef.current.width, docRef.current.height, symmetryMode, () => crypto.randomUUID());
    setStrokes(old => [...old, ...completedMarks]);
    activeRef.current = null;
    const beforeStroke = moveSnapshotRef.current;
    if (beforeStroke) setEditUndoStack(old => [...old, beforeStroke]);
    moveSnapshotRef.current = null; setEditRedoStack([]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setPlanRedoStack([]);
    setRedoStack([]);
    setNotice(completedMarks.length > 1 ? 'Symmetry drawing added ' + completedMarks.length + ' marks · Undo is available' : 'Drawing mark added · Undo is available');
  };
  const undo = () => {
    const action = historyOrder[historyOrder.length - 1];
    if (action === 'plan' && planUndoStack.length) {
      const snapshot = planUndoStack[planUndoStack.length - 1];
      const current: PlanSnapshot = { planId: snapshot.planId, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background, activeLayerId };
      setPlanRedoStack(old => [...old, current]); setPlanUndoStack(old => old.slice(0, -1));
      setHistoryOrder(old => old.slice(0, -1)); setRedoOrder(old => [...old, 'plan']);
      docRef.current = { ...docRef.current, strokes: snapshot.strokes, background: snapshot.background };
      setStrokes(snapshot.strokes); setLayers(snapshot.layers); setActiveLayerId(snapshot.activeLayerId || snapshot.layers.find(layer => !layer.locked)?.id || snapshot.layers[0]?.id || DEFAULT_LAYER.id); setBackground(snapshot.background); setRedoStack([]);
      setNotice(snapshot.planId.startsWith('layer-edit:') ? 'Layer edit undone' : 'AI drawing plan undone as one step'); return;
    }
    if (action === 'edit' && editUndoStack.length) {
      const previous = editUndoStack[editUndoStack.length - 1];
      setEditRedoStack(old => [...old, strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }))]);
      setEditUndoStack(old => old.slice(0, -1)); setHistoryOrder(old => old.slice(0, -1)); setRedoOrder(old => [...old, 'edit']);
      setStrokes(previous); setSelectedStrokeId(null); setRedoStack([]); setNotice('Manual edit undone'); return;
    }
    if (!action && planUndoStack.length) {
      const snapshot = planUndoStack[planUndoStack.length - 1];
      const current: PlanSnapshot = { planId: snapshot.planId, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background, activeLayerId };
      setPlanRedoStack(old => [...old, current]); setPlanUndoStack(old => old.slice(0, -1));
      docRef.current = { ...docRef.current, strokes: snapshot.strokes, background: snapshot.background };
      setStrokes(snapshot.strokes); setLayers(snapshot.layers); setActiveLayerId(snapshot.activeLayerId || snapshot.layers.find(layer => !layer.locked)?.id || snapshot.layers[0]?.id || DEFAULT_LAYER.id); setBackground(snapshot.background); setRedoStack([]);
      setNotice(snapshot.planId.startsWith('layer-edit:') ? 'Layer edit undone' : 'AI drawing plan undone as one step'); return;
    }
    if (!strokes.length) return;
    setRedoStack(r => [strokes[strokes.length - 1], ...r]); setStrokes(s => s.slice(0, -1)); setNotice('Last stroke undone');
  };
  const redo = () => {
    const action = redoOrder[redoOrder.length - 1];
    if (action === 'plan' && planRedoStack.length) {
      const snapshot = planRedoStack[planRedoStack.length - 1];
      const current: PlanSnapshot = { planId: snapshot.planId, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background, activeLayerId };
      setPlanUndoStack(old => [...old, current]); setPlanRedoStack(old => old.slice(0, -1));
      setHistoryOrder(old => [...old, 'plan']); setRedoOrder(old => old.slice(0, -1));
      docRef.current = { ...docRef.current, strokes: snapshot.strokes, background: snapshot.background };
      setStrokes(snapshot.strokes); setLayers(snapshot.layers); setActiveLayerId(snapshot.activeLayerId || snapshot.layers.find(layer => !layer.locked)?.id || snapshot.layers[0]?.id || DEFAULT_LAYER.id); setBackground(snapshot.background); setRedoStack([]);
      setNotice(snapshot.planId.startsWith('layer-edit:') ? 'Layer edit restored' : 'AI drawing plan restored as one step'); return;
    }
    if (action === 'edit' && editRedoStack.length) {
      const next = editRedoStack[editRedoStack.length - 1];
      setEditUndoStack(old => [...old, strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }))]);
      setEditRedoStack(old => old.slice(0, -1)); setHistoryOrder(old => [...old, 'edit']); setRedoOrder(old => old.slice(0, -1));
      setStrokes(next); setSelectedStrokeId(null); setRedoStack([]); setNotice('Manual edit restored'); return;
    }
    if (!action && planRedoStack.length) {
      const snapshot = planRedoStack[planRedoStack.length - 1];
      const current: PlanSnapshot = { planId: snapshot.planId, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background, activeLayerId };
      setPlanUndoStack(old => [...old, current]); setPlanRedoStack(old => old.slice(0, -1));
      docRef.current = { ...docRef.current, strokes: snapshot.strokes, background: snapshot.background };
      setStrokes(snapshot.strokes); setLayers(snapshot.layers); setActiveLayerId(snapshot.activeLayerId || snapshot.layers.find(layer => !layer.locked)?.id || snapshot.layers[0]?.id || DEFAULT_LAYER.id); setBackground(snapshot.background); setRedoStack([]);
      setNotice(snapshot.planId.startsWith('layer-edit:') ? 'Layer edit restored' : 'AI drawing plan restored as one step'); return;
    }
    if (!redoStack.length) return;
    setStrokes(s => [...s, redoStack[0]]); setRedoStack(r => r.slice(1)); setNotice('Stroke restored');
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName))) return;
      if (planAction?.status === 'running') return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier) {
        if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
        else if (key === 'y') { event.preventDefault(); redo(); }
        return;
      }
      if (event.altKey) return;
      if (key === '[' || key === '{') { event.preventDefault(); setSize(value => Math.max(1, value - ((event.shiftKey || key === '{') ? 10 : 1))); return; }
      if (key === ']' || key === '}') { event.preventDefault(); setSize(value => Math.min(200, value + ((event.shiftKey || key === '}') ? 10 : 1))); return; }
      const toolShortcuts: Record<string, Tool> = { b: 'brush', e: 'eraser', v: 'select', h: 'pan', l: 'line', r: 'rectangle', o: 'ellipse', t: 'text', i: 'eyedropper', p: 'panel', u: 'bubble' };
      const nextTool = toolShortcuts[key];
      if (nextTool) {
        event.preventDefault();
        setTool(nextTool);
        setNotice(nextTool.charAt(0).toUpperCase() + nextTool.slice(1) + ' tool selected');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, planAction?.status]);
  const addCurrentColorToPalette = () => {
    const result = addPaletteColor(customColors, color);
    if (!result.added) {
      setNotice(result.reason === 'duplicate' ? 'That color is already saved in your palette.' : result.reason === 'full' ? 'Custom palette is full (16 swatches). Remove a swatch before adding another.' : 'Choose a valid hex color first.');
      return;
    }
    setCustomColors(result.colors); setNotice('Saved ' + color.toUpperCase() + ' to your custom palette.');
  };
  const removeCustomColor = (swatch: string) => {
    setCustomColors(old => removePaletteColor(old, swatch));
    setNotice('Removed ' + swatch.toUpperCase() + ' from your custom palette.');
  };
  const selectedStroke = selectedStrokeId ? strokes.find(stroke => stroke.id === selectedStrokeId) : undefined;
  const snapshotStrokes = () => strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));
  const selectedStrokeLocked = !!selectedStroke && !!layers.find(item => item.id === (selectedStroke.layerId || layers[0]?.id))?.locked;
  const checkpointSelectedEdit = () => {
    if (!selectedStroke || selectedStrokeLocked) return;
    setEditUndoStack(old => [...old, snapshotStrokes()]);
    setHistoryOrder(old => [...old, 'edit']);
    setRedoOrder([]); setEditRedoStack([]); setRedoStack([]); setPlanRedoStack([]);
  };
  const removeSelected = () => {
    if (!selectedStroke) return;
    const layer = layers.find(item => item.id === (selectedStroke.layerId || layers[0]?.id));
    if (layer?.locked) { setNotice('Unlock "' + layer.name + '" before deleting this object.'); return; }
    setEditUndoStack(old => [...old, snapshotStrokes()]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setEditRedoStack([]); setRedoStack([]); setPlanRedoStack([]);
    setStrokes(old => old.filter(stroke => stroke.id !== selectedStroke.id)); setSelectedStrokeId(null); setNotice('Selected object deleted · Undo is available');
  };
  const duplicateSelected = () => {
    if (!selectedStroke) return;
    const layer = layers.find(item => item.id === (selectedStroke.layerId || layers[0]?.id));
    if (layer?.locked) { setNotice('Unlock "' + layer.name + '" before duplicating this object.'); return; }
    const duplicate: Stroke = { ...selectedStroke, id: crypto.randomUUID(), points: selectedStroke.points.map(point => ({ ...point, x: point.x + 24, y: point.y + 24 })) };
    setEditUndoStack(old => [...old, snapshotStrokes()]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setEditRedoStack([]); setRedoStack([]); setPlanRedoStack([]);
    setStrokes(old => [...old, duplicate]); setSelectedStrokeId(duplicate.id); setNotice('Object duplicated · Undo is available');
  };
  const flipSelected = (axis: FlipAxis) => {
    if (!selectedStroke) return;
    const layer = layers.find(item => item.id === (selectedStroke.layerId || layers[0]?.id));
    if (layer?.locked) { setNotice('Unlock "' + layer.name + '" before flipping this object.'); return; }
    const result = flipStrokeGeometry(selectedStroke, axis);
    if (!result.ok) { setNotice(result.reason); return; }
    setEditUndoStack(old => [...old, snapshotStrokes()]);
    setHistoryOrder(old => [...old, 'edit']);
    setRedoOrder([]); setEditRedoStack([]); setRedoStack([]); setPlanRedoStack([]);
    setStrokes(old => old.map(stroke => stroke.id === selectedStroke.id ? result.stroke as Stroke : stroke));
    setNotice('Flipped selected artwork ' + axis + ' · Undo is available');
  };
  const reorderSelected = (edge: LayerEdge) => {
    if (!selectedStroke) return;
    const layer = layers.find(item => item.id === (selectedStroke.layerId || layers[0]?.id));
    if (layer?.locked) { setNotice('Unlock "' + layer.name + '" before reordering this object.'); return; }
    const next = moveArtworkToLayerEdge(strokes, selectedStroke.id, edge, layers[0]?.id);
    if (next === strokes) { setNotice(edge === 'front' ? 'This object is already at the front of its layer.' : 'This object is already at the back of its layer.'); return; }
    setEditUndoStack(old => [...old, snapshotStrokes()]);
    setHistoryOrder(old => [...old, 'edit']);
    setRedoOrder([]); setEditRedoStack([]); setRedoStack([]); setPlanRedoStack([]);
    setStrokes(next);
    setNotice(edge === 'front' ? 'Brought object to front of its layer · Undo is available' : 'Sent object to back of its layer · Undo is available');
  };
  const nudgeSelected = (dx: number, dy: number, checkpoint: boolean) => {
    if (!selectedStroke) return;
    const layer = layers.find(item => item.id === (selectedStroke.layerId || layers[0]?.id));
    if (layer?.locked) { setNotice('Unlock "' + layer.name + '" before moving this object.'); return; }
    if (checkpoint) {
      setEditUndoStack(old => [...old, snapshotStrokes()]); setHistoryOrder(old => [...old, 'edit']);
      setRedoOrder([]); setEditRedoStack([]); setRedoStack([]); setPlanRedoStack([]);
    }
    setStrokes(old => old.map(stroke => stroke.id === selectedStroke.id ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) } : stroke));
    setNotice('Moved selected object ' + (dx || dy ? '· Undo is available' : ''));
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(target.tagName))) return;
      if (planAction?.status === 'running') return;
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === 'd' && tool === 'select' && selectedStroke) { event.preventDefault(); duplicateSelected(); return; }
      if (modifier || event.altKey || !selectedStroke) return;
      if ((key === 'delete' || key === 'backspace') && tool === 'select') { event.preventDefault(); removeSelected(); return; }
      if (tool !== 'select') return;
      const step = event.shiftKey ? 10 : 1;
      const delta = key === 'arrowleft' ? [-step,0] : key === 'arrowright' ? [step,0] : key === 'arrowup' ? [0,-step] : key === 'arrowdown' ? [0,step] : null;
      if (delta) { event.preventDefault(); nudgeSelected(delta[0], delta[1], !event.repeat); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, selectedStrokeId, strokes, layers, duplicateSelected, removeSelected, nudgeSelected, planAction?.status]);
  const clear = () => { if (!strokes.length || !globalThis.confirm('Clear all strokes from this canvas?')) return; setEditUndoStack(old => [...old, strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }))]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setEditRedoStack([]); setPlanRedoStack([]); setStrokes([]); setRedoStack([]); setSelectedStrokeId(null); setNotice('Canvas cleared · Undo is available'); };

  const importReferenceImage = async (file?: File) => {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setNotice('Use a PNG, JPEG, or WebP reference image.'); return; }
    if (file.size > 10 * 1024 * 1024) { setNotice('Reference images must be 10 MB or smaller.'); return; }
    const destinationLayer = layers.find(layer => !layer.locked && layer.visible) || layers.find(layer => !layer.locked);
    if (!destinationLayer) { setNotice('Unlock a layer before importing a reference image.'); return; }
    try {
      const imageDataUrl = await readImageFile(file);
      await preloadDrawingImages([{ shape: 'image', imageDataUrl }]);
      const image = imageCache.get(imageDataUrl);
      if (!image || !image.naturalWidth || !image.naturalHeight) throw new Error('The selected file is not a readable image.');
      const scale = Math.min(1, 800 / image.naturalWidth, 600 / image.naturalHeight);
      const width = Math.max(1, image.naturalWidth * scale), height = Math.max(1, image.naturalHeight * scale);
      const x = (docRef.current.width - width) / 2, y = (docRef.current.height - height) / 2;
      const reference: Stroke = {
        id: crypto.randomUUID(), layerId: destinationLayer.id, tool: 'brush', shape: 'image',
        imageDataUrl, imageName: file.name.slice(0, 180), color: '#ffffff', size: 1,
        points: [{ x, y, pressure: 1 }, { x: x + width, y: y + height, pressure: 1 }],
      };
      const before = strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));
      setEditUndoStack(old => [...old, before]); setEditRedoStack([]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setRedoStack([]); setPlanRedoStack([]);
      setStrokes(old => [reference, ...old]); setSelectedStrokeId(reference.id); setTool('select');
      setNotice('Imported ' + (file.name || 'reference image') + ' as a selectable object. Resize, rotate, move, or undo it as needed.');
    } catch (error) {
      setNotice('Could not import reference image: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  };

  const saveDrawingToStoryVault = async () => {
    if (!projectId) { setNotice('Choose a project before linking a drawing to the Story Vault.'); return; }
    if (!loaded) { setNotice('Wait for this drawing to finish loading before saving a reference.'); return; }
    const title = globalThis.prompt('Name this reusable panel or drawing template', drawingName || 'Panel template');
    if (!title?.trim()) return;
    const chapterText = globalThis.prompt('Chapter number (optional)', '');
    const chapterNumber = chapterText?.trim() ? Number(chapterText.trim()) : undefined;
    if (chapterNumber !== undefined && (!Number.isInteger(chapterNumber) || chapterNumber < 0)) { setNotice('Chapter must be a non-negative whole number. Nothing was added.'); return; }
    setSaveState('saving');
    try {
      const now = new Date().toISOString();
      await drawingStorage.save({ id: drawingId, projectId, name: drawingName, version: 1, width: docRef.current.width, height: docRef.current.height, background, strokes, layers, updatedAt: now });
      await storyMemoryStorage.save({
        id: crypto.randomUUID(), projectId, kind: 'panel-template', title: title.trim(),
        summary: 'Reusable drawing asset linked to the exact saved canvas "' + drawingName + '". Open the linked drawing from Story Vault to reuse this composition.',
        ...(chapterNumber !== undefined ? { chapterNumber } : {}),
        entityIds: [], tags: ['drawing-asset','panel-template'], source: 'user', status: 'proposed',
        assetRefs: ['drawing:' + drawingId], supersedes: [], createdAt: now, updatedAt: now,
      });
      setSaveState('saved');
      setNotice('Drawing linked to Story Vault as a proposal. Review and approve it in Creative Vault.');
    } catch (error) {
      setSaveState('error'); setNotice('Could not link this drawing to Story Vault: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  };

  const exportPng = () => {
    const out = createSurface(docRef.current.width * exportScale, docRef.current.height * exportScale);
    const ctx = out?.getContext('2d');
    if (!out || !ctx) { setNotice('PNG export is unavailable in this browser'); return; }
    if (!transparentExport) { ctx.fillStyle = background; ctx.fillRect(0, 0, out.width, out.height); }
    const surface = createSurface(out.width, out.height);
    const layerCtx = surface?.getContext('2d');
    if (!surface || !layerCtx) { setNotice('PNG export is unavailable in this browser'); return; }
    for (const layer of layers) {
      if (!layer.visible) continue;
      layerCtx.clearRect(0, 0, surface.width, surface.height);
      layerCtx.save(); layerCtx.scale(exportScale, exportScale);
      for (const stroke of strokes) {
        if ((stroke.layerId || layers[0]?.id) === layer.id) drawStroke(layerCtx, stroke);
      }
      layerCtx.restore();
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation = layer.blendMode === 'normal' || !layer.blendMode ? 'source-over' : layer.blendMode;
      ctx.drawImage(surface, 0, 0);
      ctx.restore();
    }
    const link = document.createElement('a');
    link.download = 'kuro-canvas-sketch-' + String(exportScale).replace('.', '-') + 'x.png';
    link.href = out.toDataURL('image/png');
    link.click();
    setNotice('PNG exported at ' + out.width + ' × ' + out.height + ' · hidden layers excluded' + (transparentExport ? ' · transparent background' : ''));
  };

  const exportSvg = () => {
    try {
      const content = buildSvgDocument({
        width: docRef.current.width, height: docRef.current.height, background,
        transparentBackground: transparentExport, strokes, layers,
      });
      const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }));
      const link = document.createElement('a');
      link.download = 'kuro-canvas-artwork.svg';
      link.href = url;
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('SVG exported · editable paths, shapes, text, visible layers, and embedded references');
    } catch (error) {
      setNotice('SVG export failed: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  };

  const applyPanelLayout = () => {
    const layer = layers.find(item => item.id === activeLayerId);
    if (!layer || layer.locked) { setNotice('Unlock or select an unlocked layer before creating panel frames.'); return; }
    const scaleX = docRef.current.width / 1600, scaleY = docRef.current.height / 1200;
    const frames: Stroke[] = PANEL_LAYOUTS[panelLayout].map(([x1,y1,x2,y2]) => ({
      id: crypto.randomUUID(), layerId: layer.id, tool: 'brush', shape: 'panel', color, size: 6,
      points: [{ x: x1 * scaleX, y: y1 * scaleY, pressure: 0.5 }, { x: x2 * scaleX, y: y2 * scaleY, pressure: 0.5 }],
    }));
    const before = strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) }));
    setEditUndoStack(old => [...old, before]); setEditRedoStack([]); setHistoryOrder(old => [...old, 'edit']); setRedoOrder([]); setRedoStack([]); setPlanRedoStack([]);
    setStrokes(old => [...old, ...frames]); setSelectedStrokeId(null); setTool('select');
    setNotice('Created ' + frames.length + ' editable comic panel frames as one undoable layout.');
  };

  const checkpointLayerEdit = (label: string) => {
    const snapshot: PlanSnapshot = {
      planId: 'layer-edit:' + label,
      strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })),
      layers: layers.map(layer => ({ ...layer })),
      background,
      activeLayerId,
    };
    setPlanUndoStack(old => [...old, snapshot]); setPlanRedoStack([]); setHistoryOrder(old => [...old, 'plan']); setRedoOrder([]);
    setEditRedoStack([]); setRedoStack([]);
  };
  const addLayer = () => {
    const name = globalThis.prompt('Layer name', 'New layer');
    if (!name?.trim()) return;
    const layer: Layer = { id: crypto.randomUUID(), name: name.trim(), visible: true, locked: false, opacity: 1, blendMode: 'normal' };
    checkpointLayerEdit('add layer');
    setLayers(old => [...old, layer]); setActiveLayerId(layer.id); setNotice('Added layer ' + layer.name);
  };
  const duplicateActiveLayer = () => {
    const source = layers.find(layer => layer.id === activeLayerId);
    if (!source) return;
    const id = crypto.randomUUID();
    const copy: Layer = { ...source, id, name: source.name + ' copy', locked: false };
    checkpointLayerEdit('duplicate layer');
    const duplicated = strokes.filter(stroke => (stroke.layerId || layers[0]?.id) === source.id).map(stroke => ({ ...stroke, id: crypto.randomUUID(), layerId: id, points: stroke.points.map(point => ({ ...point })) }));
    setLayers(old => [...old, copy]); setStrokes(old => [...old, ...duplicated]); setActiveLayerId(id); setRedoStack([]);
    setNotice('Duplicated layer and its artwork');
  };
  const clearActiveLayer = () => {
    const layer = layers.find(item => item.id === activeLayerId);
    if (!layer) { setNotice('Select a layer to clear.'); return; }
    if (layer.locked) { setNotice('Unlock "' + layer.name + '" before clearing its artwork.'); return; }
    const count = strokes.filter(stroke => (stroke.layerId || layers[0]?.id) === layer.id).length;
    if (!count) { setNotice('The active layer is already empty.'); return; }
    if (!globalThis.confirm('Clear ' + count + ' mark(s) from "' + layer.name + '"? You can undo this action.')) return;
    checkpointLayerEdit('clear layer');
    setStrokes(old => old.filter(stroke => (stroke.layerId || layers[0]?.id) !== layer.id));
    setSelectedStrokeId(null); setNotice('Cleared ' + count + ' mark(s) from "' + layer.name + '" · Undo is available');
  };
  const deleteActiveLayer = () => {
    if (layers.length <= 1) { setNotice('Keep at least one layer in the drawing'); return; }
    const current = layers.find(layer => layer.id === activeLayerId);
    if (!current || !globalThis.confirm('Delete layer "' + current.name + '" and its artwork?')) return;
    checkpointLayerEdit('delete layer');
    const nextLayers = layers.filter(layer => layer.id !== current.id);
    setLayers(nextLayers); setStrokes(old => old.filter(stroke => (stroke.layerId || layers[0]?.id) !== current.id));
    setActiveLayerId(nextLayers.find(layer => !layer.locked)?.id || nextLayers[0].id); setRedoStack([]);
    setNotice('Layer and its artwork deleted');
  };
  const renameLayer = (id: string) => {
    const current = layers.find(layer => layer.id === id);
    if (!current) return;
    const name = globalThis.prompt('Rename layer', current.name);
    if (name?.trim() && name.trim() !== current.name) { checkpointLayerEdit('rename layer'); setLayers(old => old.map(layer => layer.id === id ? { ...layer, name: name.trim() } : layer)); }
  };
  const switchDrawing = (id: string) => { setLoaded(false); setDrawingId(id); setPanOffset({ x: 0, y: 0 }); setZoom(1); };
  useEffect(() => { if (!projectId || requestedDrawingId) return; const scopedDefaultId = 'default-canvas-' + projectId; if (drawingId !== scopedDefaultId) switchDrawing(scopedDefaultId); }, [projectId]);
  useEffect(() => {
    if (!requestedDrawingId) return;
    if (requestedDrawingId !== drawingId) switchDrawing(requestedDrawingId);
    // The load effect reports the selected ID after the document has been restored.
  }, [requestedDrawingId]);
  const resetView = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); setNotice('Canvas view centered at 100%'); };
  const createDrawing = () => {
    const name = globalThis.prompt('Name your new drawing', 'Untitled drawing');
    if (!name?.trim()) return;
    const presetChoice = globalThis.prompt('Canvas preset: landscape, portrait, square, webtoon, manga, A4, or custom', 'landscape');
    if (!presetChoice?.trim()) return;
    const preset = presetChoice.trim().toLowerCase();
    let dimensions = CANVAS_PRESETS[preset];
    if (preset === 'custom') {
      const widthInput = globalThis.prompt('Canvas width in pixels (256–6000)', '1600');
      if (widthInput === null) return;
      const heightInput = globalThis.prompt('Canvas height in pixels (256–6000)', '1200');
      if (heightInput === null) return;
      dimensions = [Number(widthInput), Number(heightInput)];
    }
    if (!dimensions) { setNotice('Unknown canvas preset. Choose landscape, portrait, square, webtoon, manga, A4, or custom.'); return; }
    const [width, height] = dimensions;
    if (!isValidCanvasDimensions(width, height)) {
      setNotice('Canvas dimensions must be 256–6000 px per side and no more than 16 megapixels. Nothing was created.'); return;
    }
    const id = crypto.randomUUID();
    setLoaded(false); setSaveState('loading');
    setDrawingId(id); setDrawingName(name.trim()); setStrokes([]); setRedoStack([]);
    setLayers([DEFAULT_LAYER]); setActiveLayerId(DEFAULT_LAYER.id); setSelectedStrokeId(null);
    setEditUndoStack([]); setEditRedoStack([]); setHistoryOrder([]); setRedoOrder([]); setPlanUndoStack([]); setPlanRedoStack([]);
    setBackground('#fffdfb'); setZoom(1); setPanOffset({x:0,y:0});
    const newDoc: Doc = { version: 1, width, height, background: '#fffdfb', strokes: [] };
    docRef.current = newDoc; pendingNewDocRef.current = { id, doc: newDoc };
    setNotice('Creating ' + name.trim() + ' · ' + width + ' × ' + height);
  };
  const renameDrawing = async () => {
    const name = globalThis.prompt('Rename drawing', drawingName);
    if (!name?.trim()) return;
    setDrawingName(name.trim());
    try {
      await drawingStorage.save({ id: drawingId, projectId, name: name.trim(), version: 1, width: docRef.current.width, height: docRef.current.height, background: docRef.current.background, strokes: docRef.current.strokes, layers, updatedAt: new Date().toISOString() });
      await refreshDocuments(); setSaveState('saved'); setNotice('Drawing renamed');
    } catch (error) { setSaveState('error'); setNotice('Rename failed: ' + (error instanceof Error ? error.message : 'unknown error')); }
  };
  const deleteDrawing = async () => {
    if (!globalThis.confirm('Delete "' + drawingName + '" from this device? This cannot be undone.')) return;
    try {
      await drawingStorage.remove(drawingId);
      const remaining = await drawingStorage.list(projectId); setDocuments(remaining);
      const next = remaining[0];
      if (next) switchDrawing(next.id);
      else {
        switchDrawing('default-canvas-v1'); setDrawingName('My first sketch'); setStrokes([]); setRedoStack([]);
        setLayers([DEFAULT_LAYER]); setActiveLayerId(DEFAULT_LAYER.id);
      }
      setNotice('Drawing deleted from this device');
    } catch (error) { setSaveState('error'); setNotice('Delete failed: ' + (error instanceof Error ? error.message : 'unknown error')); }
  };

  return <section className="alt drawing-alt" aria-busy={planAction?.status === 'running'}>
    {planAction?.status === 'running' && <div className="drawing-plan-blocker" role="status" aria-live="polite">
      <strong>Kuro is applying your approved drawing plan…</strong>
      <span>She is saving and verifying the actual editable canvas. Editing is paused briefly to protect your changes.</span>
    </div>}
    <div className="althead"><div><small>EDITABLE 2D DRAWING</small><h1>Canvas</h1><p>Brush, eraser, geometric shape tools, layers, undo/redo, and PNG export.</p><div className="drawing-project-controls"><label>Drawing <select value={drawingId} onChange={e => switchDrawing(e.target.value)}><option value="default-canvas-v1">{drawingId==='default-canvas-v1'?drawingName:'My first sketch (legacy)'}</option>{documents.filter(d=>d.id!=='default-canvas-v1').map(d=><option key={d.id} value={d.id}>{d.name||'Untitled drawing'}</option>)}</select></label><button onClick={createDrawing}>＋ New drawing</button><button onClick={renameDrawing}>Rename</button><button onClick={deleteDrawing}>Delete</button></div></div><button onClick={() => setShowHelp(v => !v)}><CircleHelp size={15}/> {showHelp ? 'Hide tips' : 'Drawing tips'}</button></div>
    {showHelp && <div className="drawing-help">New drawings support landscape, portrait, square, Webtoon, manga, A4, and validated custom dimensions. Tall pages scroll without being squashed. Draw with mouse, finger, or stylus. Shortcuts: B brush, E eraser, V select, H pan, L line, R rectangle, O ellipse, T lettering, I eyedropper, P panel, U speech balloon. Use [ and ] to change brush size; Shift+[ or Shift+] changes it faster. In Select mode, arrow keys nudge objects (Shift for 10 px), Delete removes, and Ctrl/Cmd+D duplicates. Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z redoes. Line, rectangle, ellipse, comic-panel, and speech-bubble tools create editable vector-like strokes. Layout presets create starter page grids in one undoable action. Pressure is used when your device reports it. Use Stabilizer to reduce hand jitter on slow curves and ink lines. The eraser only affects the active layer; PNG export excludes hidden layers.</div>}
    <div className="draw-toolbar">
      <div className="draw-toolgroup">
        <button className={tool==='select'?'chosen':''} onClick={() => setTool('select')} title="Select and move objects"><MousePointer2 size={16}/><span>Select</span></button>
        <button className={tool==='brush'?'chosen':''} onClick={() => setTool('brush')} title="Brush"><Pencil size={16}/><span>Brush</span></button>
        <button className={tool==='eyedropper'?'chosen':''} onClick={() => setTool('eyedropper')} title="Sample a color from the visible canvas"><Pipette size={16}/><span>Eyedropper</span></button>
        <button className={tool==='eraser'?'chosen':''} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={16}/><span>Eraser</span></button>
        <button className={tool==='pan'?'chosen':''} onClick={() => setTool('pan')} title="Pan"><Hand size={16}/><span>Pan</span></button>
        <button className={tool==='line'?'chosen':''} onClick={() => setTool('line')} title="Line"><Minus size={16}/><span>Line</span></button>
        <button className={tool==='rectangle'?'chosen':''} onClick={() => setTool('rectangle')} title="Rectangle"><Square size={16}/><span>Rectangle</span></button>
        <button className={tool==='panel'?'chosen':''} onClick={() => setTool('panel')} title="Draw a comic panel frame"><Square size={16}/><span>Panel</span></button>
        <button className={tool==='bubble'?'chosen':''} onClick={() => setTool('bubble')} title="Draw a speech balloon with a tail"><MessageCircle size={16}/><span>Bubble</span></button>
        <label className="panel-layout-control">Layout <select aria-label="Comic panel layout" value={panelLayout} onChange={e => setPanelLayout(e.target.value as PanelLayoutPreset)}><option value="two-rows">Two rows</option><option value="three-columns">Three columns</option><option value="grid-2x2">2 × 2 grid</option><option value="hero-sidebar">Hero + sidebar</option><option value="webtoon-stack">Webtoon stack</option></select></label><button onClick={applyPanelLayout} title="Create editable frames for the selected panel layout">Create panels</button>
        <button className={tool==='ellipse'?'chosen':''} onClick={() => setTool('ellipse')} title="Ellipse"><Circle size={16}/><span>Ellipse</span></button>
        <button className={tool==='text'?'chosen':''} onClick={() => setTool('text')} title="Comic lettering"><Type size={16}/><span>Text</span></button>
      </div>
      {tool === 'select' && selectedStroke && <div className="selection-transform-tools" aria-label="Selected artwork inspector"><span className="selection-inspector-title">Object</span><label className="selection-color-control">Color <input aria-label="Selected object color" type="color" value={/^#[0-9a-f]{6}$/i.test(selectedStroke.color) ? selectedStroke.color : '#171321'} disabled={selectedStrokeLocked} onFocus={checkpointSelectedEdit} onChange={e => setStrokes(old => applyStrokeAppearance(old, selectedStroke.id, { color: e.target.value }))}/></label><label className="selection-opacity-control">Opacity <input aria-label="Selected object opacity" type="range" min="0" max="100" value={Math.round((selectedStroke.opacity ?? 1) * 100)} disabled={selectedStrokeLocked} onPointerDown={checkpointSelectedEdit} onKeyDown={e => {if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key) && !e.repeat) checkpointSelectedEdit();}} onChange={e => setStrokes(old => applyStrokeAppearance(old, selectedStroke.id, { opacity: Number(e.target.value) / 100 }))}/><span>{Math.round((selectedStroke.opacity ?? 1) * 100)}%</span></label><label className="selection-opacity-control">Weight <input aria-label="Selected object stroke weight" type="range" min="1" max="256" value={Math.min(256,Math.max(1,Math.round(selectedStroke.size)))} disabled={selectedStrokeLocked} onPointerDown={checkpointSelectedEdit} onKeyDown={e => {if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key) && !e.repeat) checkpointSelectedEdit();}} onChange={e => setStrokes(old => applyStrokeAppearance(old, selectedStroke.id, { size: Number(e.target.value) }))}/><span>{Math.round(selectedStroke.size)}</span></label>{(selectedStroke.shape === 'rectangle' || selectedStroke.shape === 'ellipse') && <button type="button" disabled={selectedStrokeLocked} aria-pressed={!!selectedStroke.filled} onClick={() => {checkpointSelectedEdit();setStrokes(old => applyStrokeAppearance(old, selectedStroke.id, { filled: !selectedStroke.filled }));}}>{selectedStroke.filled ? 'Remove fill' : 'Fill shape'}</button>}<button type="button" disabled={selectedStrokeLocked} onClick={() => flipSelected('horizontal')} title="Mirror selected vector artwork left to right">Flip ↔</button><button type="button" disabled={selectedStrokeLocked} onClick={() => flipSelected('vertical')} title="Mirror selected vector artwork top to bottom">Flip ↕</button><button type="button" disabled={selectedStrokeLocked} onClick={() => reorderSelected('back')} title="Send selected artwork behind other objects on this layer">To back</button><button type="button" disabled={selectedStrokeLocked} onClick={() => reorderSelected('front')} title="Bring selected artwork in front of other objects on this layer">To front</button></div>}
      <div className="draw-colors">{COLORS.map(c => <button key={c} aria-label={'Choose '+c} title={c} className={color===c?'color-picked':''} style={{background:c}} onClick={() => {setColor(c);setTool('brush')}}/>)}{customColors.map(c => <span className="custom-swatch" key={c}><button aria-label={'Choose saved color '+c} title={'Saved '+c} className={color===c?'color-picked':''} style={{background:c}} onClick={() => {setColor(c);setTool('brush')}}/><button type="button" className="custom-swatch-remove" aria-label={'Remove saved color '+c} title="Remove swatch" onClick={() => removeCustomColor(c)}>×</button></span>)}<button type="button" className="add-color-swatch" onClick={addCurrentColorToPalette} title="Save the current color as a reusable swatch">+ Swatch</button><label className="custom-color" title="Choose any brush color"><input aria-label="Custom brush color" type="color" value={color} onChange={e => {setColor(e.target.value);setTool('brush')}}/></label></div>
      <label className="brush-preset-control">Brush <select aria-label="Brush preset" value={brushPreset} onChange={e => {setBrushPreset(e.target.value as BrushPreset);setTool('brush')}}><option value="ink">Ink pen</option><option value="pencil">Pencil</option><option value="marker">Marker</option><option value="airbrush">Airbrush</option><option value="watercolor">Watercolor wash</option><option value="dry-brush">Dry brush</option><option value="calligraphy">Calligraphy nib</option></select></label>
      <label className="background-control">Paper <input aria-label="Canvas paper color" type="color" value={background} onChange={e => setBackground(e.target.value)}/></label>
      {(tool==='rectangle' || tool==='ellipse') && <button className={'grid-toggle '+(fillShapes?'chosen':'')} aria-pressed={fillShapes} onClick={() => setFillShapes(value => !value)} title="Fill closed shapes with the selected color">Fill</button>}
      <button className={'grid-toggle '+(showGrid?'chosen':'')} aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}>Grid</button>
      <label className="symmetry-control" title="Mirror new strokes around the center of the canvas">Symmetry <select aria-label="Drawing symmetry mode" value={symmetryMode} onChange={e => setSymmetryMode(e.target.value as SymmetryMode)}><option value="off">Off</option><option value="vertical">Vertical mirror</option><option value="horizontal">Horizontal mirror</option><option value="quad">Four-way</option></select></label>
      {tool==='text' && <><label className="text-draft-control">Lettering <textarea rows={2} value={textDraft} onChange={e => setTextDraft(e.target.value)} placeholder="Type dialogue; use new lines, then tap canvas" maxLength={500}/></label><label className="brush-preset-control">Font <select aria-label="Lettering font" value={letteringFont} onChange={e => setLetteringFont(e.target.value as 'comic'|'sans'|'serif')}><option value="comic">Comic</option><option value="sans">Sans</option><option value="serif">Serif</option></select></label></>}
      {selectedStroke && tool==='select' && <div className="selected-object-actions" role="group" aria-label="Selected object actions"><button onClick={duplicateSelected} title="Duplicate selected object"><Copy size={14}/> Duplicate</button><button onClick={removeSelected} title="Delete selected object"><Trash2 size={14}/> Delete</button></div>}
      {(tool==='brush' || tool==='eraser') && <label className="stabilizer-control">Stabilizer <input aria-label="Brush stabilization" type="range" min="0" max="10" value={stabilizer} onChange={e => setStabilizer(Number(e.target.value))}/><b>{stabilizer}</b></label>}
      {tool!=='select' && tool!=='pan' && tool!=='eyedropper' && <label className="stroke-opacity-control">Opacity <input aria-label="Stroke opacity" type="range" min="1" max="100" value={strokeOpacity} onChange={e => setStrokeOpacity(Number(e.target.value))}/><b>{strokeOpacity}%</b></label>}
      {tool!=='eyedropper' && <label className="size-control">Size <input aria-label="Brush or shape size" type="range" min="1" max="200" value={size} onChange={e => setSize(Number(e.target.value))}/><b>{tool==='text'?Math.max(12,size*2):size}px</b></label>}
      <div className="draw-actions"><button title="Undo" disabled={!strokes.length && !planUndoStack.length && !editUndoStack.length} onClick={undo}><RotateCcw size={15}/></button><button title="Redo" disabled={!redoStack.length && !planRedoStack.length && !editRedoStack.length} onClick={redo}><RotateCw size={15}/></button><button title="Zoom out" onClick={() => setZoom(z => Math.max(.25, +(z-.1).toFixed(2)))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button title="Fit canvas to view" onClick={() => { setZoom(1); setPanOffset({x:0,y:0}); }}>Fit</button><button title="Zoom in" onClick={() => setZoom(z => Math.min(4, +(z+.1).toFixed(2)))}><Plus size={15}/></button><button title="Clear canvas" disabled={!strokes.length} onClick={clear}><Trash2 size={15}/></button><button onClick={() => imageInputRef.current?.click()} title="Import a reference image"><ImagePlus size={15}/> Reference image</button><input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void importReferenceImage(event.target.files?.[0]); event.target.value=''; }}/>{projectId && <button onClick={() => void saveDrawingToStoryVault()} title="Link this exact drawing to the project Story Vault"><Library size={15}/> Save to Vault</button>}<label className="export-scale-control">Resolution <select aria-label="PNG export resolution" value={exportScale} onChange={e => setExportScale(Number(e.target.value) as 1 | 1.5 | 2)}><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label><label className="transparent-export-control" title="Export without the paper background"><input type="checkbox" checked={transparentExport} onChange={e => setTransparentExport(e.target.checked)}/> Transparent export</label><button onClick={createVersionCheckpoint} title="Create a named recoverable checkpoint"><History size={15}/> Save version</button><button onClick={exportSvg} title="Export vector artwork as SVG"><Download size={15}/> Export SVG</button><button className="export" onClick={exportPng}><Download size={15}/> Export PNG</button></div>
    </div>
    <div className="version-history-panel"><div className="version-history-head"><b><History size={14}/> Version history</b><span>{revisions.length}/20 checkpoints</span><button onClick={() => void refreshRevisions()}>Refresh</button></div>{revisions.length===0?<p>No named versions yet. Save a checkpoint before a major edit to make it easy to recover later.</p>:<div className="version-history-list">{revisions.map(revision=><div className="version-history-row" key={revision.id}><span><b>{revision.title}</b><small>{new Date(revision.createdAt).toLocaleString()}</small></span><button onClick={() => void restoreVersionCheckpoint(revision.id,revision.title)}>Restore</button></div>)}</div>}</div><div className="layer-panel"><div className="layer-panel-head"><b>Layers</b><div className="layer-panel-actions"><button onClick={addLayer}>＋ Add layer</button><button onClick={duplicateActiveLayer}>Duplicate</button><button onClick={clearActiveLayer}>Clear active</button><button onClick={deleteActiveLayer} disabled={layers.length<=1}>Delete active</button></div></div>{[...layers].map((layer, index) => ({ layer, index })).reverse().map(({layer,index}) => <div key={layer.id} className={'layer-row '+(activeLayerId===layer.id?'active-layer':'')}><button className="layer-select" onClick={() => setActiveLayerId(layer.id)}>{layer.name}{activeLayerId===layer.id?' · Active':''}</button><button title={layer.visible?'Hide layer':'Show layer'} onClick={() => { checkpointLayerEdit('visibility'); setLayers(old => old.map(item => item.id===layer.id?{...item,visible:!item.visible}:item)); }}>{layer.visible?'◉':'○'}</button><button title={layer.locked?'Unlock layer':'Lock layer'} onClick={() => { checkpointLayerEdit('lock'); setLayers(old => old.map(item => item.id===layer.id?{...item,locked:!item.locked}:item)); }}>{layer.locked?'🔒':'🔓'}</button><button title="Move layer up" disabled={index===layers.length-1} onClick={() => { checkpointLayerEdit('reorder'); setLayers(old => { const next=[...old]; [next[index],next[index+1]]=[next[index+1],next[index]]; return next; }); }}>↑</button><button title="Move layer down" disabled={index===0} onClick={() => { checkpointLayerEdit('reorder'); setLayers(old => { const next=[...old]; [next[index],next[index-1]]=[next[index-1],next[index]]; return next; }); }}>↓</button><button title="Rename layer" onClick={() => renameLayer(layer.id)}>✎</button><label className="layer-opacity">Opacity <input type="range" min="0" max="100" value={Math.round((layer.opacity ?? 1)*100)} onPointerDown={() => checkpointLayerEdit('opacity')} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && !event.repeat) checkpointLayerEdit('opacity'); }} onChange={e => setLayers(old => old.map(item => item.id===layer.id?{...item,opacity:Number(e.target.value)/100}:item))}/></label><select aria-label={'Blend mode for '+layer.name} value={layer.blendMode ?? 'normal'} onChange={e => { checkpointLayerEdit('blend mode'); setLayers(old => old.map(item => item.id===layer.id?{...item,blendMode:e.target.value as BlendMode}:item)); }}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option></select></div>)}</div>
    <div className="drawing-stage" ref={wrapRef} onWheel={event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const nextZoom = Math.max(0.25, Math.min(4, +(zoom * Math.exp(-event.deltaY * 0.002)).toFixed(3)));
      if (nextZoom === zoom) return;
      const rect = paperRef.current?.getBoundingClientRect();
      if (rect) {
        const ratio = nextZoom / zoom;
        const anchorX = event.clientX - (rect.left + rect.width / 2);
        const anchorY = event.clientY - (rect.top + rect.height / 2);
        setPanOffset(offset => ({ x: offset.x + anchorX * (1 - ratio), y: offset.y + anchorY * (1 - ratio) }));
      }
      setZoom(nextZoom);
    }}>
      <div className="drawing-paper" ref={paperRef} style={{ aspectRatio: docRef.current.width + ' / ' + docRef.current.height, transform: 'translate('+panOffset.x+'px, '+panOffset.y+'px) scale('+zoom+')' }}><canvas ref={canvasRef} aria-label="Drawing canvas. Use pointer, touch, or stylus to draw." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} />{showGrid && <div className="canvas-grid-overlay" aria-hidden="true" />}{symmetryMode !== 'off' && <div className="symmetry-guides" aria-hidden="true">{(symmetryMode === 'vertical' || symmetryMode === 'quad') && <i className="symmetry-axis-vertical" />}{(symmetryMode === 'horizontal' || symmetryMode === 'quad') && <i className="symmetry-axis-horizontal" />}</div>}{selectedStrokeId && strokes.some(stroke => stroke.id === selectedStrokeId) && (() => { const selected = strokes.find(stroke => stroke.id === selectedStrokeId)!; const bounds = getStrokeBounds(selected); return <div className="canvas-selection-outline" style={{ left: (bounds.x / docRef.current.width * 100) + '%', top: (bounds.y / docRef.current.height * 100) + '%', width: (bounds.width / docRef.current.width * 100) + '%', height: (bounds.height / docRef.current.height * 100) + '%', transform: 'rotate(' + ((selected.rotation ?? 0) * 180 / Math.PI) + 'deg)', transformOrigin: 'center center' }} aria-hidden="true"/>; })()}</div>
    </div>
    {planAction && <div className={'draw-status ai-action-status ' + planAction.status} role="status" aria-live="polite"><span><b>Native tool agent · {planAction.status.replace('-', ' ')}</b> — {planAction.title}{planAction.error ? ': ' + planAction.error : ''}</span>{planAction.status==='failed' && <button onClick={() => setPlanRunNonce(value => value + 1)}>Retry action</button>}</div>}{planProgress && <div className="draw-status ai-action-status running" role="status" aria-live="polite"><span><b>Live drawing progress</b> — {planProgress.completed} / {planProgress.total} native actions · {planProgress.command}</span><progress value={planProgress.completed} max={Math.max(1, planProgress.total)} aria-label="Native drawing action progress" /> <button type="button" onClick={() => cancelPlanExecutionRef.current?.()}>Cancel drawing</button></div>}
    <div className="draw-status"><span>{saveState==='error'?<AlertTriangle size={13}/>:<i/>} {notice}</span><span className={'save-indicator '+saveState}>{saveState==='loading'?'Loading local drawing…':saveState==='saving'?'Saving…':saveState==='error'?'Not saved':<><Cloud size={12}/> Saved on this device</>} · {strokes.length} stroke{strokes.length===1?'':'s'} · {docRef.current.width} × {docRef.current.height}</span></div>
  </section>;
}
