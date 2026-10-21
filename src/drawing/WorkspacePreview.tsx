import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, PenTool } from "lucide-react";
import { drawingStorage } from "../core/storage";
import { buildSvgDocument } from "./svgExport";

interface WorkspacePreviewProps {
  projectId: string;
  drawingId?: string;
  onOpenCanvas: () => void;
}

/** Render the real saved, editable drawing as a lightweight SVG workspace preview. */
export default function WorkspacePreview({ projectId, drawingId, onOpenCanvas }: WorkspacePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [drawingName, setDrawingName] = useState("");
  const [notice, setNotice] = useState("Choose or open a canvas to see saved artwork here.");
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const refreshForProject = (changedProjectId?: string) => {
      if (!changedProjectId || changedProjectId === projectId) setRefreshVersion(version => version + 1);
    };
    const onStorageChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      refreshForProject(detail?.projectId);
    };
    let channel: BroadcastChannel | undefined;
    window.addEventListener("kuro:drawing-storage-changed", onStorageChanged);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("kuro-drawing-storage");
        channel.addEventListener("message", event => refreshForProject((event.data as { projectId?: string } | undefined)?.projectId));
      }
    } catch { channel = undefined; }
    return () => {
      window.removeEventListener("kuro:drawing-storage-changed", onStorageChanged);
      channel?.close();
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setPreviewUrl("");
    setDrawingName("");
    if (!projectId.trim()) {
      setLoading(false);
      setNotice("Open a project to preview artwork from its own canvas.");
      return () => { cancelled = true; };
    }

    setLoading(true);
    setNotice("Loading the latest saved canvas…");
    void (async () => {
      try {
        const available = await drawingStorage.list(projectId);
        if (cancelled) return;
        const selected = (drawingId ? available.find(item => item.id === drawingId) : undefined) ?? available[0];
        if (!selected) {
          setNotice("No saved drawing yet. Open the canvas to start creating an editable scene.");
          setLoading(false);
          return;
        }
        const document = await drawingStorage.load(selected.id, projectId);
        if (cancelled) return;
        if (!document) {
          setNotice("That drawing was removed. Open the canvas to select an existing document or create a new one.");
          setLoading(false);
          return;
        }
        const layers = document.layers?.length
          ? document.layers.map(layer => ({
              id: layer.id, name: layer.name, visible: layer.visible,
              opacity: layer.opacity ?? 1, blendMode: layer.blendMode ?? "normal",
            }))
          : [{ id: "layer-default", name: "Sketch", visible: true, opacity: 1, blendMode: "normal" }];
        const svg = buildSvgDocument({
          width: document.width, height: document.height, background: document.background,
          strokes: document.strokes, layers,
        });
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        setPreviewUrl(objectUrl);
        setDrawingName(document.name || "Untitled drawing");
        setNotice(document.strokes.length
          ? "Saved editable canvas · " + document.strokes.length + " strokes/shapes · " + document.width + " × " + document.height
          : "Saved canvas is currently empty. No artwork has been invented for this preview.");
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setNotice("Could not load the saved canvas preview: " + (error instanceof Error ? error.message : "unknown storage error"));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, drawingId, refreshVersion]);

  return (
    <div className="preview-placeholder workspace-preview">
      <div className="workspace-preview-status">
        <span className="placeholder-icon"><PenTool size={21} /></span>
        <span className="workspace-preview-label">SAVED WORKSPACE CANVAS</span>
      </div>
      {loading ? (
        <div className="workspace-preview-empty"><LoaderCircle className="workspace-preview-spin" size={18} /><span>Reading the editable document…</span></div>
      ) : previewUrl ? (
        <img className="workspace-preview-image" src={previewUrl} alt={"Preview of saved drawing: " + drawingName} />
      ) : (
        <div className="workspace-preview-empty"><PenTool size={17} /><span>{notice}</span></div>
      )}
      {previewUrl && <b>{drawingName}</b>}
      {previewUrl && <p>{notice}</p>}
      <button type="button" onClick={onOpenCanvas}>Open drawing canvas <ArrowRight size={13} /></button>
    </div>
  );
}
