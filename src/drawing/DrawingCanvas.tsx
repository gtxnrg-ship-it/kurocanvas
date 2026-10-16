import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Minus, Plus, RotateCcw, RotateCw, Download, Trash2, Hand, Pencil, CircleHelp, Cloud, AlertTriangle } from 'lucide-react';
import { drawingStorage } from '../core/storage';
import type { LocalDrawingDocument } from '../core/storage';

type Tool = 'brush' | 'eraser' | 'pan';
type Point = { x: number; y: number; pressure: number };
type Layer = { id: string; name: string; visible: boolean; locked: boolean };
type Stroke = { id: string; layerId?: string; tool: 'brush' | 'eraser'; color: string; size: number; points: Point[] };
type Doc = { version: 1; width: number; height: number; background: string; strokes: Stroke[] };

const COLORS = ['#f7f2ff', '#191522', '#b69aff', '#ff8fb3', '#78e5c6', '#ffca78', '#7ab7ff'];

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Stroke | null>(null);
  const docRef = useRef<Doc>({ version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] });
  const [documents, setDocuments] = useState<Array<{id:string;name?:string;updatedAt:string}>>([]);
  const [drawingId, setDrawingId] = useState('default-canvas-v1');
  const [drawingName, setDrawingName] = useState('My first sketch');
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(COLORS[2]);
  const [size, setSize] = useState(6);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [layers, setLayers] = useState<Layer[]>([{ id: 'layer-default', name: 'Sketch', visible: true, locked: false }]);
  const [activeLayerId, setActiveLayerId] = useState('layer-default');
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [zoom, setZoom] = useState(1);
  const [background, setBackground] = useState('#fffdfb');
  const [notice, setNotice] = useState('Ready to draw · Pressure-aware pointer input');
  const [showHelp, setShowHelp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'loading'|'saved'|'saving'|'error'>('loading');

  const render = useCallback((nextStrokes: Stroke[] = docRef.current.strokes, bg = docRef.current.background) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const sx = w / docRef.current.width, sy = h / docRef.current.height;
    ctx.save(); ctx.scale(sx, sy);
    for (const stroke of nextStrokes) {
      const layer = layers.find(item => item.id === (stroke.layerId || layers[0]?.id));
      if (!layer || !layer.visible || !stroke.points.length) continue;
      ctx.save();
      ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#000' : stroke.color;
      ctx.fillStyle = stroke.tool === 'eraser' ? '#000' : stroke.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (stroke.points.length === 1) {
        const p = stroke.points[0]; ctx.beginPath(); ctx.arc(p.x, p.y, stroke.size * (p.pressure || 0.5), 0, Math.PI * 2); ctx.fill();
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          const a = stroke.points[i - 1], b = stroke.points[i];
          ctx.beginPath(); ctx.lineWidth = stroke.size * Math.max(0.15, ((a.pressure || 0.5) + (b.pressure || 0.5)) / 2);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }, [layers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
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
    setLoaded(false); setSaveState('loading');
    drawingStorage.load(drawingId).then(saved => {
      if (cancelled) return;
      if (saved) {
        const doc: LocalDrawingDocument = saved;
        docRef.current = { version: 1, width: doc.width, height: doc.height, background: doc.background, strokes: doc.strokes };
        setStrokes(doc.strokes); setLayers(doc.layers?.length ? doc.layers : [{ id: 'layer-default', name: 'Sketch', visible: true, locked: false }]); setActiveLayerId(doc.layers?.[0]?.id || 'layer-default'); setBackground(doc.background); setDrawingName(doc.name || 'Untitled drawing');
        setNotice('Opened ' + (doc.name || 'saved drawing'));
      } else {
        docRef.current = { version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] };
        setStrokes([]); setRedoStack([]); setLayers([{ id: 'layer-default', name: 'Sketch', visible: true, locked: false }]); setActiveLayerId('layer-default'); setBackground('#fffdfb');
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
    const timer = window.setTimeout(() => {
      drawingStorage.save({
        id: drawingId, name: drawingName, version: 1, width: docRef.current.width, height: docRef.current.height,
        background: docRef.current.background, strokes: docRef.current.strokes, layers, updatedAt: new Date().toISOString(),
      }).then(() => setSaveState('saved')).catch(error => {
        setSaveState('error');
        setNotice('Autosave failed: ' + (error instanceof Error ? error.message : 'unknown error'));
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [strokes, background, layers, loaded, render, drawingId, drawingName]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * docRef.current.width, y: ((e.clientY - rect.top) / rect.height) * docRef.current.height, pressure: e.pressure > 0 ? e.pressure : 0.5 };
  };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') { setNotice('Pan mode selected · pinch/zoom controls are available below'); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (layers.find(layer => layer.id === activeLayerId)?.locked) { setNotice('This layer is locked. Select an unlocked layer to draw.'); return; }
    const p = pointFromEvent(e);
    activeRef.current = { id: crypto.randomUUID(), layerId: activeLayerId, tool, color, size, points: [p] };
    render([...strokes, activeRef.current], background);
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    const points = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    activeRef.current.points.push(...points.map(ev => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: ((ev.clientX - rect.left) / rect.width) * docRef.current.width, y: ((ev.clientY - rect.top) / rect.height) * docRef.current.height, pressure: ev.pressure > 0 ? ev.pressure : 0.5 };
    }));
    render([...strokes, activeRef.current], background);
  };
  const pointerUp = () => {
    if (!activeRef.current) return;
    setStrokes(old => [...old, activeRef.current!]); activeRef.current = null; setRedoStack([]);
    setNotice('Stroke added · Undo is available');
  };
  const undo = () => { if (!strokes.length) return; setRedoStack(r => [strokes[strokes.length - 1], ...r]); setStrokes(s => s.slice(0, -1)); setNotice('Last stroke undone'); };
  const redo = () => { if (!redoStack.length) return; setStrokes(s => [...s, redoStack[0]]); setRedoStack(r => r.slice(1)); setNotice('Stroke restored'); };
  const clear = () => { if (!strokes.length || !window.confirm('Clear all strokes from this canvas?')) return; setStrokes([]); setRedoStack([]); setNotice('Canvas cleared'); };
  const exportPng = () => {
    const out = document.createElement('canvas'); out.width = docRef.current.width; out.height = docRef.current.height;
    const ctx = out.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = background; ctx.fillRect(0, 0, out.width, out.height);
    for (const s of strokes) {
      if (!s.points.length) continue; ctx.save(); ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.points.length === 1) { const p = s.points[0]; ctx.beginPath(); ctx.arc(p.x, p.y, s.size * (p.pressure || .5), 0, Math.PI * 2); ctx.fill(); }
      else for (let i=1;i<s.points.length;i++) { const a=s.points[i-1], b=s.points[i]; ctx.beginPath(); ctx.lineWidth=s.size*Math.max(.15,((a.pressure||.5)+(b.pressure||.5))/2); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
      ctx.restore();
    }
    const link = document.createElement('a'); link.download = 'kuro-canvas-sketch.png'; link.href = out.toDataURL('image/png'); link.click(); setNotice('PNG exported at 1600 × 1200');
  };

  const addLayer = () => { const name = window.prompt('Layer name', 'New layer'); if (!name?.trim()) return; const layer = { id: crypto.randomUUID(), name: name.trim(), visible: true, locked: false }; setLayers(old => [...old, layer]); setActiveLayerId(layer.id); setNotice('Added layer ' + layer.name); };
  const renameLayer = (id: string) => { const current = layers.find(layer => layer.id === id); if (!current) return; const name = window.prompt('Rename layer', current.name); if (name?.trim()) setLayers(old => old.map(layer => layer.id === id ? { ...layer, name: name.trim() } : layer)); };
  const switchDrawing = (id: string) => { setLoaded(false); setDrawingId(id); };

  const createDrawing = () => {
    const name = window.prompt('Name your new drawing', 'Untitled drawing');
    if (!name?.trim()) return;
    const id = crypto.randomUUID();
    setDrawingId(id); setDrawingName(name.trim()); setStrokes([]); setRedoStack([]);
    setBackground('#fffdfb'); docRef.current = { version: 1, width: 1600, height: 1200, background: '#fffdfb', strokes: [] };
    setLoaded(false); setSaveState('loading'); setNotice('Creating ' + name.trim());
  };
  const renameDrawing = async () => {
    const name = window.prompt('Rename drawing', drawingName);
    if (!name?.trim()) return;
    setDrawingName(name.trim());
    try {
      await drawingStorage.save({ id: drawingId, name: name.trim(), version: 1, width: docRef.current.width, height: docRef.current.height, background: docRef.current.background, strokes: docRef.current.strokes, updatedAt: new Date().toISOString() });
      await refreshDocuments(); setSaveState('saved'); setNotice('Drawing renamed');
    } catch (error) { setSaveState('error'); setNotice('Rename failed: ' + (error instanceof Error ? error.message : 'unknown error')); }
  };
  const deleteDrawing = async () => {
    if (!window.confirm('Delete "' + drawingName + '" from this device? This cannot be undone.')) return;
    try {
      await drawingStorage.remove(drawingId);
      const remaining = await drawingStorage.list(); setDocuments(remaining);
      const next = remaining[0];
      if (next) switchDrawing(next.id);
      else { switchDrawing('default-canvas-v1'); setDrawingName('My first sketch'); setStrokes([]); setRedoStack([]); }
      setNotice('Drawing deleted from this device');
    } catch (error) { setSaveState('error'); setNotice('Delete failed: ' + (error instanceof Error ? error.message : 'unknown error')); }
  };

  return <section className="alt drawing-alt">
    <div className="althead"><div><small>EDITABLE 2D DRAWING</small><h1>Canvas</h1><p>Real strokes, erasing, undo/redo, pressure-aware input, and PNG export.</p><div className="drawing-project-controls"><label>Drawing <select value={drawingId} onChange={e => switchDrawing(e.target.value)}><option value="default-canvas-v1">{drawingId==='default-canvas-v1'?drawingName:'My first sketch (legacy)'}</option>{documents.filter(d=>d.id!=='default-canvas-v1').map(d=><option key={d.id} value={d.id}>{d.name||'Untitled drawing'}</option>)}</select></label><button onClick={createDrawing}>＋ New drawing</button><button onClick={renameDrawing}>Rename</button><button onClick={deleteDrawing}>Delete</button></div></div><button onClick={() => setShowHelp(v => !v)}><CircleHelp size={15}/> {showHelp ? 'Hide tips' : 'Drawing tips'}</button></div>
    {showHelp && <div className="drawing-help">Draw with mouse, finger, or stylus. Pressure is used when your device reports it. Use the eraser to remove pixels from earlier strokes; Undo restores the last stroke. PNG export uses the full 1600 × 1200 document size.</div>}
    <div className="draw-toolbar">
      <div className="draw-toolgroup">
        <button className={tool==='brush'?'chosen':''} onClick={() => setTool('brush')} title="Brush"><Pencil size={16}/><span>Brush</span></button>
        <button className={tool==='eraser'?'chosen':''} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={16}/><span>Eraser</span></button>
        <button className={tool==='pan'?'chosen':''} onClick={() => setTool('pan')} title="Pan"><Hand size={16}/><span>Pan</span></button>
      </div>
      <div className="draw-colors">{COLORS.map(c => <button key={c} aria-label={'Choose '+c} title={c} className={color===c?'color-picked':''} style={{background:c}} onClick={() => {setColor(c);setTool('brush')}}/>)}</div>
      <label className="size-control">Size <input type="range" min="1" max="36" value={size} onChange={e => setSize(Number(e.target.value))}/><b>{size}px</b></label>
      <div className="draw-actions"><button title="Undo" disabled={!strokes.length} onClick={undo}><RotateCcw size={15}/></button><button title="Redo" disabled={!redoStack.length} onClick={redo}><RotateCw size={15}/></button><button title="Zoom out" onClick={() => setZoom(z => Math.max(.5, +(z-.1).toFixed(1)))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button title="Zoom in" onClick={() => setZoom(z => Math.min(1.5, +(z+.1).toFixed(1)))}><Plus size={15}/></button><button title="Clear canvas" disabled={!strokes.length} onClick={clear}><Trash2 size={15}/></button><button className="export" onClick={exportPng}><Download size={15}/> Export PNG</button></div>
    </div>
    <div className="layer-panel"><div className="layer-panel-head"><b>Layers</b><button onClick={addLayer}>＋ Add layer</button></div>{[...layers].reverse().map(layer => <div key={layer.id} className={'layer-row '+(activeLayerId===layer.id?'active-layer':'')}><button className="layer-select" onClick={() => setActiveLayerId(layer.id)}>{layer.name}{activeLayerId===layer.id?' · Active':''}</button><button title={layer.visible?'Hide layer':'Show layer'} onClick={() => setLayers(old => old.map(item => item.id===layer.id?{...item,visible:!item.visible}:item))}>{layer.visible?'◉':'○'}</button><button title={layer.locked?'Unlock layer':'Lock layer'} onClick={() => setLayers(old => old.map(item => item.id===layer.id?{...item,locked:!item.locked}:item))}>{layer.locked?'🔒':'🔓'}</button><button title="Rename layer" onClick={() => renameLayer(layer.id)}>✎</button></div>)}</div>
    <div className="drawing-stage" ref={wrapRef}>
      <div className="drawing-paper" style={{ transform: 'scale('+zoom+')' }}><canvas ref={canvasRef} aria-label="Drawing canvas. Use pointer, touch, or stylus to draw." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} /></div>
    </div>
    <div className="draw-status"><span>{saveState==='error'?<AlertTriangle size={13}/>:<i/>} {notice}</span><span className={'save-indicator '+saveState}>{saveState==='loading'?'Loading local drawing…':saveState==='saving'?'Saving…':saveState==='error'?'Not saved':<><Cloud size={12}/> Saved on this device</>} · {strokes.length} stroke{strokes.length===1?'':'s'} · 1600 × 1200</span></div>
  </section>;
}
