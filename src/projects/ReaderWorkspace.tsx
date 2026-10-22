import { useEffect, useRef, useState } from 'react';
import { BookOpen, MessageCircle, PenTool, RefreshCw } from 'lucide-react';
import { drawingStorage, type LocalDrawingDocument } from '../core/storage';
import { buildSvgDocument } from '../drawing/svgExport';

type ReaderPageSummary = {
  id: string;
  name?: string;
  updatedAt: string;
};

type ReaderPageDetails = {
  title: string;
  updatedAt: string;
  width: number;
  height: number;
  strokeCount: number;
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

/**
 * Each reader card loads its full document only near the viewport, rather than loading
 * every drawing and building every SVG preview when the Reader opens. Preview blob URLs
 * are released again as cards leave the preload window.
 */
function ReaderPageCard({
  summary,
  index,
  projectId,
  onOpenPage,
}: {
  summary: ReaderPageSummary;
  index: number;
  projectId: string;
  onOpenPage: (drawingId: string) => void;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [details, setDetails] = useState<ReaderPageDetails | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(item => item.target === node);
      if (entry) setNearViewport(entry.isIntersecting);
    }, { root: null, rootMargin: '600px 0px', threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) {
      setPreviewUrl(null);
      return;
    }

    let alive = true;
    let objectUrl: string | null = null;
    setPageError('');

    void drawingStorage.load(summary.id, projectId).then(document => {
      if (!document) throw new Error('This drawing is no longer available in the active universe.');
      if (!alive) return;
      const nextDetails: ReaderPageDetails = {
        title: document.name?.trim() || summary.name?.trim() || 'Untitled page',
        updatedAt: document.updatedAt || summary.updatedAt,
        width: document.width,
        height: document.height,
        strokeCount: document.strokes.length,
      };
      setDetails(nextDetails);
      const nextUrl = createPreview(document);
      if (!alive) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      objectUrl = nextUrl;
      setPreviewUrl(nextUrl);
    }).catch(cause => {
      if (alive) setPageError(cause instanceof Error ? cause.message : 'Could not load this saved page.');
    });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nearViewport, summary.id, summary.name, summary.updatedAt, projectId]);

  const title = details?.title || summary.name?.trim() || 'Untitled page';
  return (
    <article className="reader-page" ref={articleRef}>
      <div className="reader-page-meta">
        <span>PAGE {String(index + 1).padStart(2, '0')}</span>
        <h2>{title}</h2>
        {details
          ? <p>{details.width} × {details.height} · {details.strokeCount} editable {details.strokeCount === 1 ? 'object' : 'objects'}</p>
          : <p>{nearViewport ? 'Reading saved drawing details…' : 'Saved drawing · preview loads as you scroll'}</p>}
        {details && <time dateTime={details.updatedAt}>{new Date(details.updatedAt).toLocaleString()}</time>}
        <button type="button" onClick={() => onOpenPage(summary.id)} aria-label={'Open ' + title + ' in the drawing canvas'}><PenTool size={14} /> Edit in canvas</button>
      </div>
      <div className="reader-page-art">
        {pageError
          ? <p className="reader-preview-state reader-preview-error" role="alert">{pageError}</p>
          : previewUrl
            ? <img src={previewUrl} alt={'Preview of ' + title + ', rendered from the saved drawing document'} />
            : <div className="reader-preview-state" role="status"><RefreshCw size={15} className={nearViewport ? 'reader-spin' : ''} />{nearViewport ? 'Preparing saved artwork preview…' : 'Scroll here to load the artwork preview'}</div>}
      </div>
    </article>
  );
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
  const [pages, setPages] = useState<ReaderPageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setPages([]);

    if (!projectId) {
      setLoading(false);
      setError('Choose or create a universe first. The reader only displays pages saved to that universe.');
      return () => { alive = false; };
    }

    void drawingStorage.list(projectId).then(drawings => {
      if (alive) setPages(drawings);
    }).catch(cause => {
      if (alive) setError(cause instanceof Error ? cause.message : 'Could not load saved pages.');
    }).finally(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [projectId]);

  return (
    <section className="reader-workspace">
      <header className="reader-workspace-head">
        <div>
          <small>YOUR SAVED ARTWORK</small>
          <h1><BookOpen size={23} /> Reader</h1>
          <p>Scroll through the drawings saved in this universe. Page previews load near the viewport and release their temporary memory as you move on.</p>
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
            <ReaderPageCard
              key={page.id}
              summary={page}
              index={index}
              projectId={projectId}
              onOpenPage={onOpenPage}
            />
          ))}
        </div>
      )}
    </section>
  );
}
