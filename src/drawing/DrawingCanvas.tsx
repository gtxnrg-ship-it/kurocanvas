import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Minus, Plus, RotateCcw, RotateCw, Download, Trash2, Hand, Pencil, CircleHelp, Cloud, AlertTriangle, Square, Circle } from 'lucide-react';
import { drawingStorage } from '../core/storage';
import type { LocalDrawingDocument } from '../core/storage';
import { applyCommandsToLocalDrawing } from './localDrawingBridge';
import type { NativeDrawingCommand } from './commands';

type Tool = 'brush' | 'eraser' | 'pan' | 'line' | 'rectangle' | 'ellipse';
type Point = { x: number; y: number; pressure: number };
type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
type Layer = { id: string; name: string; visible: boolean; locked: boolean; opacity: number; blendMode: BlendMode };
type Stroke = { id: string; layerId?: string; tool: 'brush' | 'eraser'; shape?: 'line' | 'rectangle' | 'ellipse'; color: string; size: number; points: Point[] };
type Doc = { version: 1; width: number; height: number; background: string; strokes: Stroke[] };
type PlanSnapshot = { planId: string; strokes: Stroke[]; layers: Layer[]; background: string };

const COLORS = ['#f7f2ff', '#191522', '#b69aff', '#ff8fb3', '#78e5c6', '#ffca78', '#7ab7ff'];
const DEFAULT_LAYER: Layer = { id: 'layer-default', name: 'Sketch', visible: true, locked: false, opacity: 1, blendMode: 'normal' };

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size * (p.pressure || 0.5), 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i];
      ctx.beginPath();
      ctx.lineWidth = stroke.size * Math.max(0.15, ((a.pressure || 0.5) + (b.pressure || 0.5)) / 2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function createSurface(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  return surface;
}

type PendingCanvasPlan = { id: string; commands: NativeDrawingCommand[] } | null;
export default function DrawingCanvas({ pendingPlan = null, onPlanResult }: { pendingPlan?: PendingCanvasPlan; onPlanResult?: (id: string, result: 'success' | 'error', message: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerSurfaceRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Stroke | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const docRef = useRef<Doc>({ version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] });
  const [documents, setDocuments] = useState<Array<{id:string;name?:string;updatedAt:string}>>([]);
  const [drawingId, setDrawingId] = useState('default-canvas-v1');
  const [drawingName, setDrawingName] = useState('My first sketch');
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(COLORS[2]);
  const [size, setSize] = useState(6);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [layers, setLayers] = useState<Layer[]>([DEFAULT_LAYER]);
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER.id);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [planUndoStack, setPlanUndoStack] = useState<PlanSnapshot[]>([]);
  const [planRedoStack, setPlanRedoStack] = useState<PlanSnapshot[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [background, setBackground] = useState('#fffdfb');
  const [notice, setNotice] = useState('Ready to draw · Pressure-aware pointer input');
  const [showHelp, setShowHelp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'loading'|'saved'|'saving'|'error'>('loading');
  const handledPlanRef = useRef<string | null>(null);

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

  const refreshDocuments = useCallback(async () => {
    try { setDocuments(await drawingStorage.list()); }
    catch (error) { setNotice('Could not list local drawings: ' + (error instanceof Error ? error.message : 'unknown error')); }
  }, []);
  useEffect(() => { void refreshDocuments(); }, [refreshDocuments]);

  useEffect(() => {
    let cancelled = false;
    // History belongs to one document only; never replay another drawing's snapshots here.
    setRedoStack([]); setPlanUndoStack([]); setPlanRedoStack([]);
    setLoaded(false); setSaveState('loading');
    drawingStorage.load(drawingId).then(saved => {
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
        docRef.current = { version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] };
        setStrokes([]); setRedoStack([]); setPlanUndoStack([]); setPlanRedoStack([]); setLayers([DEFAULT_LAYER]); setActiveLayerId(DEFAULT_LAYER.id);
        setBackground('#fffdfb');
        setNotice('New canvas · Drawings save automatically on this device');
      }
      setLoaded(true); setSaveState('saved');
    }).catch(error => {
      if (cancelled) return;
      setLoaded(true); setSaveState('error');
      setNotice('Local storage unavailable: ' + (error instanceof Error ? error.message : 'unknown error'));
    });
    return () => { cancelled = true; };
  }, [drawingId]);

  useEffect(() => {
    docRef.current = { ...docRef.current, strokes, background };
    render(strokes, background);
    if (!loaded) return;
    setSaveState('saving');
    const timer = globalThis.setTimeout(() => {
      drawingStorage.save({
        id: drawingId, name: drawingName, version: 1, width: docRef.current.width, height: docRef.current.height,
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
  }, [strokes, background, layers, loaded, render, drawingId, drawingName, refreshDocuments]);

  useEffect(() => {
    if (!pendingPlan || !loaded || !onPlanResult || handledPlanRef.current === pendingPlan.id) return;
    handledPlanRef.current = pendingPlan.id;
    let cancelled = false;
    (async () => {
      try {
        const beforePlan: PlanSnapshot = { planId: pendingPlan.id, strokes: docRef.current.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background: docRef.current.background };
        const current: LocalDrawingDocument = {
          id: drawingId, name: drawingName, version: 1, width: docRef.current.width,
          height: docRef.current.height, background: docRef.current.background,
          strokes: docRef.current.strokes, layers: layers.map(layer => ({ ...layer })),
          updatedAt: new Date().toISOString(),
        };
        const applied = applyCommandsToLocalDrawing(current, pendingPlan.commands);
        if (!applied.changed) throw new Error('The plan contained no applicable changes.');
        await drawingStorage.save(applied.document);
        if (cancelled) return;
        const nextStrokes = applied.document.strokes as Stroke[];
        const nextLayers = (applied.document.layers || [DEFAULT_LAYER]).map(layer => ({ ...layer, opacity: layer.opacity ?? 1, blendMode: (layer.blendMode ?? 'normal') as BlendMode }));
        docRef.current = { ...docRef.current, background: applied.document.background, strokes: nextStrokes };
        setStrokes(nextStrokes); setLayers(nextLayers); setRedoStack([]);
        setPlanUndoStack(old => [...old, beforePlan]); setPlanRedoStack([]);
        setSaveState('saved'); setNotice('Approved AI drawing applied and saved locally');
        onPlanResult(pendingPlan.id, 'success', 'Applied and saved locally');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown drawing error';
        setNotice('AI drawing rejected: ' + message);
        onPlanResult(pendingPlan.id, 'error', message);
      }
    })();
    return () => { cancelled = true; };
  }, [pendingPlan, loaded, onPlanResult, drawingId, drawingName, layers]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * docRef.current.width, y: ((e.clientY - rect.top) / rect.height) * docRef.current.height, pressure: e.pressure > 0 ? e.pressure : 0.5 };
  };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') {
      e.currentTarget.setPointerCapture(e.pointerId);
      panRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, originX: pan.x, originY: pan.y };
      setNotice('Drag the canvas to reposition your workspace');
      return;
    }
    if (layers.find(layer => layer.id === activeLayerId)?.locked) { setNotice('This layer is locked. Select an unlocked layer to draw.'); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = pointFromEvent(e);
    activeRef.current = { id: crypto.randomUUID(), layerId: activeLayerId, tool: tool === 'eraser' ? 'eraser' : 'brush', shape: tool === 'line' || tool === 'rectangle' || tool === 'ellipse' ? tool : undefined, color, size, points: [start] };
    render([...strokes, activeRef.current], background);
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    activeRef.current.points.push(...events.map(ev => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * docRef.current.width, y: ((ev.clientY - rect.top) / rect.height) * docRef.current.height, pressure: ev.pressure > 0 ? ev.pressure : 0.5 };
    }));
    render([...strokes, activeRef.current], background);
  };
  const pointerUp = () => {
    if (!activeRef.current) return;
    setStrokes(old => [...old, activeRef.current!]);
    activeRef.current = null;
    setRedoStack([]);
    setNotice('Drawing mark added · Undo is available');
  };
  const undo = () => {
    if (planUndoStack.length) {
      const snapshot = planUndoStack[planUndoStack.length - 1];
      const current: PlanSnapshot = { planId: snapshot.planId, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background };
      setPlanRedoStack(old => [...old, current]); setPlanUndoStack(old => old.slice(0, -1));
      docRef.current = { ...docRef.current, strokes: snapshot.strokes, background: snapshot.background };
      setStrokes(snapshot.strokes); setLayers(snapshot.layers); setBackground(snapshot.background); setRedoStack([]);
      setNotice('AI drawing plan undone as one step'); return;
    }
    if (!strokes.length) return;
    setRedoStack(r => [strokes[strokes.length - 1], ...r]); setStrokes(s => s.slice(0, -1)); setNotice('Last stroke undone');
  };
  const redo = () => {
    if (planRedoStack.length) {
      const snapshot = planRedoStack[planRedoStack.length - 1];
      const current: PlanSnapshot = { planId: snapshot.planId, strokes: strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })), layers: layers.map(layer => ({ ...layer })), background };
      setPlanUndoStack(old => [...old, current]); setPlanRedoStack(old => old.slice(0, -1));
      docRef.current = { ...docRef.current, strokes: snapshot.strokes, background: snapshot.background };
      setStrokes(snapshot.strokes); setLayers(snapshot.layers); setBackground(snapshot.background); setRedoStack([]);
      setNotice('AI drawing plan restored as one step'); return;
    }
    if (!redoStack.length) return;
    setStrokes(s => [...s, redoStack[0]]); setRedoStack(r => r.slice(1)); setNotice('Stroke restored');
  };
  const clear = () => { if (!strokes.length || !globalThis.confirm('Clear all strokes from this canvas?')) return; setStrokes([]); setRedoStack([]); setNotice('Canvas cleared'); };

  const exportPng = () => {
    const out = createSurface(docRef.current.width, docRef.current.height);
    const ctx = out?.getContext('2d');
    if (!out || !ctx) { setNotice('PNG export is unavailable in this browser'); return; }
    ctx.fillStyle = background; ctx.fillRect(0, 0, out.width, out.height);
    const surface = layerSurfaceRef.current ?? createSurface(out.width, out.height);
    const layerCtx = surface?.getContext('2d');
    if (!surface || !layerCtx) { setNotice('PNG export is unavailable in this browser'); return; }
    if (surface.width !== out.width || surface.height !== out.height) {
      surface.width = out.width;
      surface.height = out.height;
    }
    layerSurfaceRef.current = surface;
    for (const layer of layers) {
      if (!layer.visible) continue;
      layerCtx.clearRect(0, 0, surface.width, surface.height);
      for (const stroke of strokes) {
        if ((stroke.layerId || layers[0]?.id) === layer.id) drawStroke(layerCtx, stroke);
      }
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation = layer.blendMode === 'normal' || !layer.blendMode ? 'source-over' : layer.blendMode;
      ctx.drawImage(surface, 0, 0);
      ctx.restore();
    }
    const link = document.createElement('a');
    link.download = 'kuro-canvas-sketch.png';
    link.href = out.toDataURL('image/png');
    link.click();
    setNotice('PNG exported at 1600 × 1200 · hidden layers excluded');
  };

  const addLayer = () => {
    const name = globalThis.prompt('Layer name', 'New layer');
    if (!name?.trim()) return;
    const layer: Layer = { id: crypto.randomUUID(), name: name.trim(), visible: true, locked: false, opacity: 1, blendMode: 'normal' };
    setLayers(old => [...old, layer]); setActiveLayerId(layer.id); setNotice('Added layer ' + layer.name);
  };
  const renameLayer = (id: string) => {
    const current = layers.find(layer => layer.id === id);
    if (!current) return;
    const name = globalThis.prompt('Rename layer', current.name);
    if (name?.trim()) setLayers(old => old.map(layer => layer.id === id ? { ...layer, name: name.trim() } : layer));
  };
  const switchDrawing = (id: string) => { setLoaded(false); setDrawingId(id); };
  const createDrawing = () => {
    const name = globalThis.prompt('Name your new drawing', 'Untitled drawing');
    if (!name?.trim()) return;
    const id = crypto.randomUUID();
    setLoaded(false); setSaveState('loading');
    setDrawingId(id); setDrawingName(name.trim()); setStrokes([]); setRedoStack([]); setLayers([DEFAULT_LAYER]); setActiveLayerId(DEFAULT_LAYER.id);
    setBackground('#fffdfb'); docRef.current = { version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] };
    setNotice('Creating ' + name.trim());
  };
  const renameDrawing = async () => {
    const name = globalThis.prompt('Rename drawing', drawingName);
    if (!name?.trim()) return;
    setDrawingName(name.trim());
    try {
      await drawingStorage.save({ id: drawingId, name: name.trim(), version: 1, width: docRef.current.width, height: docRef.current.height, background: docRef.current.background, strokes: docRef.current.strokes, layers, updatedAt: new Date().toISOString() });
      await refreshDocuments(); setSaveState('saved'); setNotice('Drawing renamed');
    } catch (error) { setSaveState('error'); setNotice('Rename failed: ' + (error instanceof Error ? error.message : 'unknown error')); }
  };
  const deleteDrawing = async () => {
    if (!globalThis.confirm('Delete "' + drawingName + '" from this device? This cannot be undone.')) return;
    try {
      await drawingStorage.remove(drawingId);
      const remaining = await drawingStorage.list(); setDocuments(remaining);
      const next = remaining[0];
      if (next) switchDrawing(next.id);
      else {
        switchDrawing('default-canvas-v1'); setDrawingName('My first sketch'); setStrokes([]); setRedoStack([]);
        setLayers([DEFAULT_LAYER]); setActiveLayerId(DEFAULT_LAYER.id);
      }
      setNotice('Drawing deleted from this device');
    } catch (error) { setSaveState('error'); setNotice('Delete failed: ' + (error instanceof Error ? error.message : 'unknown error')); }
  };

  return <section className="alt drawing-alt">
    <div className="althead"><div><small>EDITABLE 2D DRAWING</small><h1>Canvas</h1><p>Brush, eraser, geometric shape tools, layers, undo/redo, and PNG export.</p><div className="drawing-project-controls"><label>Drawing <select value={drawingId} onChange={e => switchDrawing(e.target.value)}><option value="default-canvas-v1">{drawingId==='default-canvas-v1'?drawingName:'My first sketch (legacy)'}</option>{documents.filter(d=>d.id!=='default-canvas-v1').map(d=><option key={d.id} value={d.id}>{d.name||'Untitled drawing'}</option>)}</select></label><button onClick={createDrawing}>＋ New drawing</button><button onClick={renameDrawing}>Rename</button><button onClick={deleteDrawing}>Delete</button></div></div><button onClick={() => setShowHelp(v => !v)}><CircleHelp size={15}/> {showHelp ? 'Hide tips' : 'Drawing tips'}</button></div>
    {showHelp && <div className="drawing-help">Draw with mouse, finger, or stylus. Line, rectangle, and ellipse tools create editable vector-like strokes. Pressure is used when your device reports it. The eraser only affects the active layer; Undo restores the last mark. PNG export excludes hidden layers.</div>}
    <div className="draw-toolbar">
      <div className="draw-toolgroup">
        <button className={tool==='brush'?'chosen':''} onClick={() => setTool('brush')} title="Brush"><Pencil size={16}/><span>Brush</span></button>
        <button className={tool==='eraser'?'chosen':''} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={16}/><span>Eraser</span></button>
        <button className={tool==='pan'?'chosen':''} onClick={() => setTool('pan')} title="Pan"><Hand size={16}/><span>Pan</span></button>
        <button className={tool==='line'?'chosen':''} onClick={() => setTool('line')} title="Line"><Minus size={16}/><span>Line</span></button>
        <button className={tool==='rectangle'?'chosen':''} onClick={() => setTool('rectangle')} title="Rectangle"><Square size={16}/><span>Rectangle</span></button>
        <button className={tool==='ellipse'?'chosen':''} onClick={() => setTool('ellipse')} title="Ellipse"><Circle size={16}/><span>Ellipse</span></button>
      </div>
      <div className="draw-colors">{COLORS.map(c => <button key={c} aria-label={'Choose '+c} title={c} className={color===c?'color-picked':''} style={{background:c}} onClick={() => {setColor(c);setTool('brush')}}/>)}</div>
      <label className="size-control">Size <input type="range" min="1" max="36" value={size} onChange={e => setSize(Number(e.target.value))}/><b>{size}px</b></label>
      <div className="draw-actions"><button title="Undo" disabled={!strokes.length && !planUndoStack.length} onClick={undo}><RotateCcw size={15}/></button><button title="Redo" disabled={!redoStack.length && !planRedoStack.length} onClick={redo}><RotateCw size={15}/></button><button title="Zoom out" onClick={() => setZoom(z => Math.max(.5, +(z-.1).toFixed(1)))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button title="Zoom in" onClick={() => setZoom(z => Math.min(1.5, +(z+.1).toFixed(1)))}><Plus size={15}/></button><button title="Clear canvas" disabled={!strokes.length} onClick={clear}><Trash2 size={15}/></button><button className="export" onClick={exportPng}><Download size={15}/> Export PNG</button></div>
    </div>
    <div className="layer-panel"><div className="layer-panel-head"><b>Layers</b><button onClick={addLayer}>＋ Add layer</button></div>{[...layers].map((layer, index) => ({ layer, index })).reverse().map(({layer,index}) => <div key={layer.id} className={'layer-row '+(activeLayerId===layer.id?'active-layer':'')}><button className="layer-select" onClick={() => setActiveLayerId(layer.id)}>{layer.name}{activeLayerId===layer.id?' · Active':''}</button><button title={layer.visible?'Hide layer':'Show layer'} onClick={() => setLayers(old => old.map(item => item.id===layer.id?{...item,visible:!item.visible}:item))}>{layer.visible?'◉':'○'}</button><button title={layer.locked?'Unlock layer':'Lock layer'} onClick={() => setLayers(old => old.map(item => item.id===layer.id?{...item,locked:!item.locked}:item))}>{layer.locked?'🔒':'🔓'}</button><button title="Move layer up" disabled={index===layers.length-1} onClick={() => setLayers(old => { const next=[...old]; [next[index],next[index+1]]=[next[index+1],next[index]]; return next; })}>↑</button><button title="Move layer down" disabled={index===0} onClick={() => setLayers(old => { const next=[...old]; [next[index],next[index-1]]=[next[index-1],next[index]]; return next; })}>↓</button><button title="Rename layer" onClick={() => renameLayer(layer.id)}>✎</button><label className="layer-opacity">Opacity <input type="range" min="0" max="100" value={Math.round((layer.opacity ?? 1)*100)} onChange={e => setLayers(old => old.map(item => item.id===layer.id?{...item,opacity:Number(e.target.value)/100}:item))}/></label><select aria-label={'Blend mode for '+layer.name} value={layer.blendMode ?? 'normal'} onChange={e => setLayers(old => old.map(item => item.id===layer.id?{...item,blendMode:e.target.value as BlendMode}:item))}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option></select></div>)}</div>
    <div className="drawing-stage" ref={wrapRef}>
      <div className="drawing-paper" style={{ transform: 'translate('+pan.x+'px, '+pan.y+'px) scale('+zoom+')', transformOrigin: 'center center' }}><canvas ref={canvasRef} aria-label="Drawing canvas. Use pointer, touch, or stylus to draw." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} /></div>
    </div>
    <div className="draw-status"><span>{saveState==='error'?<AlertTriangle size={13}/>:<i/>} {notice}</span><span className={'save-indicator '+saveState}>{saveState==='loading'?'Loading local drawing…':saveState==='saving'?'Saving…':saveState==='error'?'Not saved':<><Cloud size={12}/> Saved on this device</>} · {strokes.length} stroke{strokes.length===1?'':'s'} · 1600 × 1200</span></div>
  </section>;
}
