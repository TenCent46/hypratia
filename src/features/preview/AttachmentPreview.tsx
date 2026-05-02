import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// Bundle the pdf.js worker through Vite so its version always matches
// the installed `pdfjs-dist`. Statically copying the worker into
// `public/` causes "Failed to load PDF" the moment the package version
// drifts (the API and worker must match exactly).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../store';
import { useElementClientWidth } from '../../hooks/useElementClientWidth';
import { attachments } from '../../services/attachments';
import { dialog } from '../../services/dialog';
import { parseCsvPreview, type CsvPreview } from '../../services/preview/csv';
import {
  extractOfficeTextPreview,
  type OfficeTextPreview,
} from '../../services/preview/officeText';
import type { Attachment } from '../../types';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'pdf'; source: PdfSource; pages: number }
  | { kind: 'image'; url: string }
  | { kind: 'csv'; preview: CsvPreview }
  | { kind: 'text'; text: string }
  | { kind: 'office'; preview: OfficeTextPreview }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; message: string };

type PdfSource = Blob;
const PDF_PREVIEW_GUTTER_PX = 8;
const PDF_PREVIEW_FALLBACK_WIDTH = 760;

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function isTextExt(ext: string): boolean {
  return ['txt', 'md', 'markdown', 'json', 'log', 'xml'].includes(ext);
}

function pdfBlobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([bytes.slice()], { type: mimeType || 'application/pdf' });
}

export function AttachmentPreview({
  attachmentId,
  displayName,
}: {
  attachmentId: string;
  displayName?: string;
}) {
  const attachment = useStore((s) =>
    s.attachments.find((a) => a.id === attachmentId),
  );
  if (!attachment) {
    return <div className="attachment-preview-empty">Attachment not found.</div>;
  }
  return (
    <AttachmentPreviewInner attachment={attachment} displayName={displayName} />
  );
}

function AttachmentPreviewInner({
  attachment,
  displayName,
}: {
  attachment: Attachment;
  displayName?: string;
}) {
  const ext = useMemo(() => extension(attachment.filename), [attachment.filename]);
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });
  const [previewBodyRef, previewBodyWidth] =
    useElementClientWidth<HTMLDivElement>();
  const openAiPalette = useStore((s) => s.openAiPalette);
  const [askMenu, setAskMenu] = useState<{
    x: number;
    y: number;
    selectedText: string | null;
  } | null>(null);
  const [askExtracting, setAskExtracting] = useState(false);
  const [askExtractError, setAskExtractError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      console.info('[mc:loading] AttachmentPreview load start', {
        attachmentId: attachment.id,
        kind: attachment.kind,
        ext,
        filename: attachment.filename,
      });
      setState({ kind: 'loading' });
      try {
        if (attachment.kind === 'image') {
          const url = await attachments.toUrl(attachment);
          if (alive) setState({ kind: 'image', url });
          return;
        }
        if (attachment.kind === 'pdf' || ext === 'pdf') {
          const bytes = await attachments.readBytes(attachment);
          if (alive) {
            setState({
              kind: 'pdf',
              source: pdfBlobFromBytes(bytes, attachment.mimeType),
              pages: 0,
            });
          }
          return;
        }
        const bytes = await attachments.readBytes(attachment);
        if (ext === 'csv') {
          const text = new TextDecoder('utf-8').decode(bytes);
          if (alive) setState({ kind: 'csv', preview: parseCsvPreview(text) });
          return;
        }
        if (ext === 'docx' || ext === 'pptx') {
          const preview = await extractOfficeTextPreview(bytes, ext);
          if (alive) setState({ kind: 'office', preview });
          return;
        }
        if (isTextExt(ext)) {
          const text = new TextDecoder('utf-8').decode(bytes);
          if (alive) setState({ kind: 'text', text: text.slice(0, 300_000) });
          return;
        }
        setState({
          kind: 'unsupported',
          reason:
            ext === 'doc' || ext === 'ppt'
              ? 'Legacy binary Office files cannot be previewed inline yet.'
              : 'No inline preview is available for this file type.',
        });
      } catch (err) {
        console.error('[mc:loading] AttachmentPreview load failed', {
          attachmentId: attachment.id,
          err,
        });
        if (alive) setState({ kind: 'error', message: String(err) });
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [attachment, ext]);

  async function openExternal() {
    try {
      const path = await attachments.resolveAbsolutePath(attachment);
      await dialog.openWithSystem(path);
    } catch (err) {
      console.warn('attachment open failed', err);
    }
  }

  async function reveal() {
    try {
      const path = await attachments.resolveAbsolutePath(attachment);
      await dialog.revealInFinder(path);
    } catch (err) {
      console.warn('attachment reveal failed', err);
    }
  }

  /**
   * Pull plain text from whatever preview state we have. PDFs go back to
   * pdf.js for full-document text since the rendered DOM only carries the
   * visible pages. Returns `null` when no extractable text exists (image
   * / unsupported binaries) so the caller can disable the Ask action.
   */
  const extractFullText = useCallback(async (): Promise<string | null> => {
    if (state.kind === 'text') return state.text;
    if (state.kind === 'csv') {
      return state.preview.rows.map((row) => row.join('\t')).join('\n');
    }
    if (state.kind === 'office') {
      if (!state.preview.ok) return null;
      if (state.preview.kind === 'docx') {
        return state.preview.paragraphs.join('\n\n');
      }
      return state.preview.slides
        .map((slide) =>
          [`# Slide ${slide.index}`, ...slide.lines].join('\n'),
        )
        .join('\n\n');
    }
    if (state.kind === 'pdf') {
      try {
        const buf = await state.source.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) })
          .promise;
        const out: string[] = [];
        const pages = Math.min(doc.numPages, 80);
        for (let i = 1; i <= pages; i += 1) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) =>
              typeof (item as { str?: string }).str === 'string'
                ? (item as { str: string }).str
                : '',
            )
            .join(' ');
          out.push(`# Page ${i}\n${text}`);
        }
        return out.join('\n\n');
      } catch (err) {
        console.warn('pdf text extraction failed', err);
        return null;
      }
    }
    return null;
  }, [state]);

  function onBodyContextMenu(e: ReactMouseEvent<HTMLDivElement>) {
    // Inputs / textareas (none here today, kept defensive) keep their
    // OS-native menu.
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    const within = sel?.anchorNode
      ? previewBodyRef.current?.contains(sel.anchorNode) ?? false
      : false;
    e.preventDefault();
    setAskMenu({
      x: e.clientX,
      y: e.clientY,
      selectedText: within && text ? text : null,
    });
  }

  async function runAsk(selectedText: string | null) {
    setAskMenu(null);
    if (selectedText) {
      openAiPalette(selectedText, `attachment:${attachment.id}`);
      return;
    }
    setAskExtracting(true);
    try {
      const full = await extractFullText();
      if (!full) {
        console.warn('No extractable text for', attachment.filename);
        setAskExtractError(
          `No extractable text from "${attachment.filename}".`,
        );
        return;
      }
      // Cap so a 200-page PDF doesn't choke the AI palette.
      const ASK_INPUT_CAP = 24_000;
      const trimmed =
        full.length > ASK_INPUT_CAP
          ? `${full.slice(0, ASK_INPUT_CAP)}…`
          : full;
      openAiPalette(trimmed, `attachment:${attachment.id}:full`);
    } catch (err) {
      console.warn('extractFullText failed', err);
      setAskExtractError(
        `Failed to extract text: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAskExtracting(false);
    }
  }

  return (
    <div className="attachment-preview">
      <header className="attachment-preview-header">
        <div>
          <h2>{displayName ?? attachment.filename}</h2>
          <p>
            {(ext || attachment.kind).toUpperCase()} -{' '}
            {formatBytes(attachment.bytes)}
          </p>
        </div>
        <div className="attachment-preview-actions">
          <button
            type="button"
            onClick={() => void openExternal()}
            title="Open with system default app"
          >
            Open externally
          </button>
          <button type="button" onClick={() => void reveal()}>
            Reveal
          </button>
        </div>
      </header>
      <div
        className="attachment-preview-body"
        ref={previewBodyRef}
        onContextMenu={onBodyContextMenu}
      >
        {state.kind === 'loading' ? (
          <div className="attachment-preview-empty">Loading preview...</div>
        ) : null}
        {state.kind === 'error' ? (
          <div className="result error">{state.message}</div>
        ) : null}
        {state.kind === 'unsupported' ? (
          <div className="attachment-preview-empty">{state.reason}</div>
        ) : null}
        {state.kind === 'image' ? (
          <div className="attachment-preview-image">
            <img src={state.url} alt={displayName ?? attachment.filename} />
          </div>
        ) : null}
        {state.kind === 'pdf' ? (
          <PdfInlinePreview
            source={state.source}
            availableWidth={previewBodyWidth}
            onPages={(pages) =>
              setState({ kind: 'pdf', source: state.source, pages })
            }
          />
        ) : null}
        {state.kind === 'csv' ? <CsvTable preview={state.preview} /> : null}
        {state.kind === 'text' ? (
          <pre className="attachment-preview-text">{state.text}</pre>
        ) : null}
        {state.kind === 'office' ? (
          <OfficeTextPreviewView preview={state.preview} />
        ) : null}
      </div>
      {askMenu ? (
        <AskAttachmentMenu
          x={askMenu.x}
          y={askMenu.y}
          selectedText={askMenu.selectedText}
          fileLabel={displayName ?? attachment.filename}
          onAsk={() => void runAsk(askMenu.selectedText)}
          onClose={() => setAskMenu(null)}
        />
      ) : null}
      {askExtracting ? (
        <div className="attachment-ask-toast" role="status">
          Extracting text from “{displayName ?? attachment.filename}” for AI…
        </div>
      ) : null}
      {askExtractError ? (
        <div
          className="attachment-ask-toast error"
          role="status"
          onClick={() => setAskExtractError(null)}
        >
          {askExtractError} (click to dismiss)
        </div>
      ) : null}
    </div>
  );
}

function AskAttachmentMenu({
  x,
  y,
  selectedText,
  fileLabel,
  onAsk,
  onClose,
}: {
  x: number;
  y: number;
  selectedText: string | null;
  fileLabel: string;
  onAsk: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPointer(e: globalThis.MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const preview = selectedText
    ? selectedText.length > 60
      ? `${selectedText.slice(0, 60)}…`
      : selectedText
    : null;
  return (
    <div
      ref={ref}
      className="app-context-menu"
      role="menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 220 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {preview ? (
        <div className="selection-menu-title" title={selectedText ?? ''}>
          “{preview}”
        </div>
      ) : null}
      <button type="button" className="app-context-menu-item" onClick={onAsk}>
        {selectedText
          ? 'Ask AI About Selection'
          : `Ask AI About ${fileLabel}`}
      </button>
    </div>
  );
}

function PdfInlinePreview({
  source,
  availableWidth,
  onPages,
}: {
  source: PdfSource;
  availableWidth: number;
  onPages: (pages: number) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageWidth = Math.max(
    160,
    Math.floor(
      (availableWidth || PDF_PREVIEW_FALLBACK_WIDTH) -
        PDF_PREVIEW_GUTTER_PX * 2,
    ),
  );
  return (
    <Document
      file={source}
      onLoadSuccess={({ numPages }) => {
        setLoadError(null);
        setNumPages(numPages);
        onPages(numPages);
      }}
      onLoadError={(err) => {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
        console.error('attachment PDF preview failed', err);
      }}
      loading={<div className="attachment-preview-empty">Loading PDF...</div>}
      error={
        <div className="result error">
          Failed to load PDF{loadError ? `: ${loadError}` : '.'}
        </div>
      }
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => (
        <div key={pageNo} className="attachment-pdf-page">
          <Page
            pageNumber={pageNo}
            width={pageWidth}
            renderAnnotationLayer={false}
          />
          <div className="pdf-page-label muted">page {pageNo}</div>
        </div>
      ))}
    </Document>
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
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={`${ri}-${ci}`}>{cell}</td>
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
          {slide.lines.length ? (
            slide.lines.map((line, i) => <p key={i}>{line}</p>)
          ) : (
            <p className="muted">No text found.</p>
          )}
        </section>
      ))}
    </div>
  );
}
