import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../store';
import { useElementClientWidth } from '../../hooks/useElementClientWidth';
import {
  joinKnowledgePath,
  readKnowledgeBytes,
} from '../../services/storage/KnowledgeFileService';
import { resolveMarkdownRoot } from '../../services/storage/MarkdownFileService';
import { dialog } from '../../services/dialog';
import { parseCsvPreview, type CsvPreview } from '../../services/preview/csv';
import {
  extractOfficeTextPreview,
  type OfficeTextPreview,
} from '../../services/preview/officeText';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
console.info('[mc:pdf-link] PDF worker configured for KnowledgeFilePreview', {
  workerSrc: pdfWorkerUrl,
  pdfjsVersion: pdfjs.version,
});

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'pdf'; source: Blob }
  | { kind: 'image'; url: string }
  | { kind: 'csv'; preview: CsvPreview }
  | { kind: 'text'; text: string }
  | { kind: 'office'; preview: OfficeTextPreview }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; message: string };

const PDF_PREVIEW_GUTTER_PX = 8;
const PDF_PREVIEW_FALLBACK_WIDTH = 760;

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function filename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'csv':
      return 'text/csv';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    default:
      return 'application/octet-stream';
  }
}

function isTextExt(ext: string): boolean {
  return ['txt', 'md', 'markdown', 'json', 'log', 'xml'].includes(ext);
}

export function KnowledgeFilePreview({
  path,
  pageStart,
  sentenceStart,
  sentenceEnd,
}: {
  path: string;
  /** When provided and the file is a PDF, scroll to this 1-based page
   *  on first render. Reused metadata for future highlighting. */
  pageStart?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
}) {
  const markdownStorageDir = useStore((s) => s.settings.markdownStorageDir);
  const ext = useMemo(() => extension(path), [path]);
  const name = useMemo(() => filename(path), [path]);
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });
  const [bytes, setBytes] = useState(0);
  const [bodyRef, bodyWidth] = useElementClientWidth<HTMLDivElement>();

  useEffect(() => {
    console.info('[mc:pdf-link] 08 KnowledgeFilePreview load effect', {
      path,
      ext,
      pageStart,
      sentenceStart,
      sentenceEnd,
      markdownStorageDir,
    });
    console.info('[mc:loading] KnowledgeFilePreview mount/load-trigger', {
      path,
      ext,
      pageStart,
    });
    let alive = true;
    let cleanupUrl: string | null = null;
    async function load() {
      setState({ kind: 'loading' });
      try {
        const root = await resolveMarkdownRoot(markdownStorageDir);
        const abs = await joinKnowledgePath(root, path);
        console.info('[mc:pdf-link] 09 resolved knowledge absolute path', {
          path,
          root,
          abs,
        });
        console.info('[mc:loading] KnowledgeFilePreview abs path', { root, path, abs });
        const data = await readKnowledgeBytes(abs);
        if (!alive) {
          console.debug('[mc:cite] load aborted — component unmounted', path);
          return;
        }
        setBytes(data.byteLength);
        console.info('[mc:pdf-link] 10 read knowledge bytes', {
          path,
          ext,
          bytes: data.byteLength,
          firstBytes: Array.from(data.slice(0, 12)),
        });
        console.info('[mc:loading] KnowledgeFilePreview read bytes', { path, bytes: data.byteLength });
        if (ext === 'pdf') {
          console.info('[mc:pdf-link] 11 creating PDF Blob source', {
            path,
            bytes: data.byteLength,
            mime: 'application/pdf',
            workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
            pdfjsVersion: pdfjs.version,
          });
          setState({
            kind: 'pdf',
            source: new Blob([data.slice()], { type: 'application/pdf' }),
          });
          return;
        }
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
          cleanupUrl = URL.createObjectURL(
            new Blob([data.slice()], { type: mimeFromExt(ext) }),
          );
          setState({ kind: 'image', url: cleanupUrl });
          return;
        }
        if (ext === 'csv') {
          const text = new TextDecoder('utf-8').decode(data);
          setState({ kind: 'csv', preview: parseCsvPreview(text) });
          return;
        }
        if (ext === 'docx' || ext === 'pptx') {
          setState({
            kind: 'office',
            preview: await extractOfficeTextPreview(data, ext),
          });
          return;
        }
        if (isTextExt(ext)) {
          const text = new TextDecoder('utf-8').decode(data);
          setState({ kind: 'text', text: text.slice(0, 300_000) });
          return;
        }
        setState({
          kind: 'unsupported',
          reason:
            'No inline preview is available for this binary file. Open it externally or reveal it in Finder.',
        });
      } catch (err) {
        console.error('[mc:pdf-link] 10b KnowledgeFilePreview load failed', {
          path,
          ext,
          err,
        });
        console.error('[mc:loading] KnowledgeFilePreview load failed', { path, err });
        if (alive) setState({ kind: 'error', message: String(err) });
      }
    }
    void load();
    return () => {
      alive = false;
      if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
    };
    // pageStart is intentionally excluded from deps — re-firing the
    // load() on every citation click would re-fetch bytes; the page
    // jump is handled by the dedicated `[pageStart]` effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext, markdownStorageDir, path]);

  async function absolutePath(): Promise<string> {
    const root = await resolveMarkdownRoot(markdownStorageDir);
    return joinKnowledgePath(root, path);
  }

  async function openExternal() {
    try {
      await dialog.openWithSystem(await absolutePath());
    } catch (err) {
      console.warn('knowledge file open failed', err);
    }
  }

  async function reveal() {
    try {
      await dialog.revealInFinder(await absolutePath());
    } catch (err) {
      console.warn('knowledge file reveal failed', err);
    }
  }

  return (
    <div className="attachment-preview">
      <header className="attachment-preview-header">
        <div>
          <h2>{name}</h2>
          <p>
            {(ext || 'file').toUpperCase()} - {formatBytes(bytes)}
          </p>
        </div>
        <div className="attachment-preview-actions">
          <button type="button" onClick={() => void openExternal()}>
            Open externally
          </button>
          <button type="button" onClick={() => void reveal()}>
            Reveal
          </button>
        </div>
      </header>
      <div className="attachment-preview-body" ref={bodyRef}>
        {state.kind === 'loading' ? (
          <div className="attachment-preview-empty">Loading preview...</div>
        ) : null}
        {state.kind === 'error' ? (
          <div className="result error">{state.message}</div>
        ) : null}
        {state.kind === 'unsupported' ? (
          <div className="attachment-preview-empty">{state.reason}</div>
        ) : null}
        {state.kind === 'pdf' ? (
          <KnowledgePdfPreview
            source={state.source}
            availableWidth={bodyWidth}
            pageStart={pageStart}
            sentenceStart={sentenceStart}
            sentenceEnd={sentenceEnd}
          />
        ) : null}
        {state.kind === 'image' ? (
          <div className="attachment-preview-image">
            <img src={state.url} alt={name} />
          </div>
        ) : null}
        {state.kind === 'csv' ? <CsvTable preview={state.preview} /> : null}
        {state.kind === 'text' ? (
          <pre className="attachment-preview-text">{state.text}</pre>
        ) : null}
        {state.kind === 'office' ? (
          <OfficeTextPreviewView preview={state.preview} />
        ) : null}
      </div>
    </div>
  );
}

function KnowledgePdfPreview({
  source,
  availableWidth,
  pageStart,
  sentenceStart,
  sentenceEnd,
}: {
  source: Blob;
  availableWidth: number;
  pageStart?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
}) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedPages = useRef(new Set<number>());
  const pageWidth = Math.max(
    160,
    Math.floor(
      (availableWidth || PDF_PREVIEW_FALLBACK_WIDTH) -
        PDF_PREVIEW_GUTTER_PX * 2,
    ),
  );

  // Scroll to the citation page once it's actually rendered. PDF pages
  // mount lazily as react-pdf renders them; we wait for `onRenderSuccess`
  // before scrolling so the destination element exists.
  function maybeScrollToTarget(pageNo: number) {
    if (pageStart === undefined) return;
    if (pageNo !== pageStart) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-mc-page="${pageStart}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // When `pageStart` changes after the initial mount (user clicked a
  // second citation pointing at a different page in an already-open
  // file), jump there too. If the page is already rendered we can
  // scroll synchronously; otherwise the lazy-render path handles it
  // via `maybeScrollToTarget` on `onRenderSuccess`.
  useEffect(() => {
    if (pageStart === undefined) return;
    if (!renderedPages.current.has(pageStart)) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-mc-page="${pageStart}"]`,
    );
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pageStart]);

  return (
    <div ref={containerRef}>
      <Document
        file={source}
        onLoadSuccess={({ numPages }) => {
          console.info('[mc:pdf-link] 12 PDF Document load success', {
            numPages,
            pageStart,
            sourceSize: source.size,
            workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
            pdfjsVersion: pdfjs.version,
          });
          console.info('[mc:loading] PDF loaded', { numPages, pageStart });
          setLoadError(null);
          setNumPages(numPages);
        }}
        onLoadError={(err) => {
          console.error('[mc:pdf-link] 12b PDF Document load error', {
            message: err instanceof Error ? err.message : String(err),
            err,
            pageStart,
            sourceSize: source.size,
            workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
            pdfjsVersion: pdfjs.version,
          });
          console.error('[mc:loading] PDF load error', err);
          setLoadError(err instanceof Error ? err.message : String(err));
        }}
        loading={<div className="attachment-preview-empty">Loading PDF...</div>}
        error={
          <div className="result error">
            Failed to load PDF{loadError ? `: ${loadError}` : '.'}
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => {
          const isCitationTarget = pageStart !== undefined && pageNo === pageStart;
          return (
            <div
              key={pageNo}
              className={`attachment-pdf-page${
                isCitationTarget ? ' kb-citation-target' : ''
              }`}
              data-mc-page={pageNo}
              data-mc-sentence-start={
                isCitationTarget && sentenceStart !== undefined
                  ? sentenceStart
                  : undefined
              }
              data-mc-sentence-end={
                isCitationTarget && sentenceEnd !== undefined
                  ? sentenceEnd
                  : undefined
              }
            >
              <Page
                pageNumber={pageNo}
                width={pageWidth}
                renderAnnotationLayer={false}
                onRenderSuccess={() => {
                  if (renderedPages.current.has(pageNo)) return;
                  renderedPages.current.add(pageNo);
                  maybeScrollToTarget(pageNo);
                }}
              />
              <div className="pdf-page-label muted">page {pageNo}</div>
            </div>
          );
        })}
      </Document>
    </div>
  );
}

function CsvTable({ preview }: { preview: CsvPreview }) {
  const [head, ...body] = preview.rows;
  return (
    <div className="attachment-csv-wrap">
      <table className="attachment-csv-table">
        {head ? (
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={`${i}-${cell}`}>{cell || `Column ${i + 1}`}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={`${r}-${c}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {preview.truncated ? (
        <div className="attachment-preview-empty">Preview truncated.</div>
      ) : null}
    </div>
  );
}

function OfficeTextPreviewView({ preview }: { preview: OfficeTextPreview }) {
  if (!preview.ok) {
    return <div className="attachment-preview-empty">{preview.reason}</div>;
  }
  if (preview.kind === 'docx') {
    return (
      <div className="attachment-office-text">
        {preview.paragraphs.length ? (
          preview.paragraphs.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <div className="attachment-preview-empty">No text found.</div>
        )}
      </div>
    );
  }
  return (
    <div className="attachment-office-text">
      {preview.slides.map((slide) => (
        <section key={slide.index} className="attachment-slide-preview">
          <h3>Slide {slide.index}</h3>
          {slide.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
