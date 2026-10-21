import { useEffect, useState } from 'react';
import { BookOpen, MessageCircle, PenTool, RefreshCw } from 'lucide-react';
import { drawingStorage, type LocalDrawingDocument } from '../core/storage';
import { buildSvgDocument } from '../drawing/svgExport';

type ReaderPage = {
  id: string;
  title: string;
  updatedAt: string;
  width: number;
  height: number;
  strokeCount: number;
  previewUrl: string;
};

function createPreview(document: LocalDrawingDocument): string {
  const layers = document.layers?.length
    ? document.layers.map(layer => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity ?? 1,
        blendMode: layer.blendMode ?? 'normal',
      }))
    : [{ id: 'layer-default', name: 'Sketch', visible: true, opacity: 1, blendMode: 'normal' }];
  const svg = buildSvgDocument({
    width: document.width,
    height: document.height,
    background: document.background,
    strokes: document.strokes,
    layers,
  });
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
}

export default function ReaderWorkspace({
  projectId,
  onAskKuro,
  onOpenPage,
}: {
  projectId: string;
  onAskKuro: () => void;
  onOpenPage: (drawingId: string) => void;
}) {
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const objectUrls: string[] = [];
    setLoading(true);
    setError('');
    setPages([]);

    if (!projectId) {
      setLoading(false);
      setError('Choose or create a universe first. The reader only displays pages saved to that universe.');
      return () => { alive = false; };
    }

    void (async () => {
      try {
        const drawings = await drawingStorage.list(projectId);
        const loaded = await Promise.all(drawings.map(async summary => {
          const document = await drawingStorage.load(summary.id, projectId);
          if (!document) return null;
          const previewUrl = createPreview(document);
          if (!alive) URL.revokeObjectURL(previewUrl);
          else objectUrls.push(previewUrl);
          return {
            id: document.id,
            title: document.name?.trim() || summary.name?.trim() || 'Untitled page',
            updatedAt: document.updatedAt || summary.updatedAt,
            width: document.width,
            height: document.height,
            strokeCount: document.strokes.length,
            previewUrl,
          } satisfies ReaderPage;
        }));
        if (alive) setPages(loaded.filter((page): page is ReaderPage => page !== null));
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Could not load saved pages.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [projectId]);

  return (
    <section className="reader-workspace">
      <header className="reader-workspace-head">
        <div>
          <small>YOUR SAVED ARTWORK</small>
          <h1><BookOpen size={23} /> Reader</h1>
          <p>Preview the actual drawing documents saved in the active universe. This view does not invent demo pages.</p>
        </div>
        <button type="button" onClick={onAskKuro}><MessageCircle size={15} /> Discuss with Kuro</button>
      </header>

      {loading && <div className="reader-state" role="status"><RefreshCw size={17} className="reader-spin" /> Loading saved pages…</div>}
      {!loading && error && <div className="reader-state reader-error" role="alert">{error}</div>}
      {!loading && !error && pages.length === 0 && (
        <div className="reader-state reader-empty">
          <BookOpen size={26} />
          <b>No saved drawing pages yet</b>
          <p>Create or open a drawing in the canvas. Once it is saved to this universe, it will appear here.</p>
          <button type="button" onClick={onAskKuro}>Plan a first page with Kuro</button>
        </div>
      )}
      {!loading && !error && pages.length > 0 && (
        <div className="reader-page-list">
          <div className="reader-page-count">{pages.length} saved {pages.length === 1 ? 'page' : 'pages'} · newest updated first</div>
          {pages.map((page, index) => (
            <article className="reader-page" key={page.id}>
              <div className="reader-page-meta">
                <span>PAGE {String(index + 1).padStart(2, '0')}</span>
                <h2>{page.title}</h2>
                <p>{page.width} × {page.height} · {page.strokeCount} editable {page.strokeCount === 1 ? 'object' : 'objects'}</p>
                <time dateTime={page.updatedAt}>{new Date(page.updatedAt).toLocaleString()}</time>
                <button type="button" onClick={() => onOpenPage(page.id)} aria-label={`Open ${page.title} in the drawing canvas`}><PenTool size={14} /> Edit in canvas</button>
              </div>
              <div className="reader-page-art">
                <img src={page.previewUrl} alt={`Preview of ${page.title}, rendered from the saved drawing document`} loading="lazy" />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
