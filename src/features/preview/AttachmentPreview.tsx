import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
// Bundle the pdf.js worker through Vite so its version always matches
// the installed `pdfjs-dist`. Statically copying the worker into
// `public/` causes "Failed to load PDF" the moment the package version
// drifts (the API and worker must match exactly).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../store';
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
  | { kind: 'pdf'; url: string; pages: number }
  | { kind: 'image'; url: string }
  | { kind: 'csv'; preview: CsvPreview }
  | { kind: 'text'; text: string }
  | { kind: 'office'; preview: OfficeTextPreview }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; message: string };

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

  useEffect(() => {
    let alive = true;
    async function load() {
      setState({ kind: 'loading' });
      try {
        if (attachment.kind === 'image') {
          const url = await attachments.toUrl(attachment);
          if (alive) setState({ kind: 'image', url });
          return;
        }
        if (attachment.kind === 'pdf' || ext === 'pdf') {
          const url = await attachments.toUrl(attachment);
          if (alive) setState({ kind: 'pdf', url, pages: 0 });
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
          <button type="button" onClick={() => void openExternal()}>
            Open
          </button>
          <button type="button" onClick={() => void reveal()}>
            Reveal
          </button>
        </div>
      </header>
      <div className="attachment-preview-body">
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
            url={state.url}
            onPages={(pages) =>
              setState({ kind: 'pdf', url: state.url, pages })
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
    </div>
  );
}

function PdfInlinePreview({
  url,
  onPages,
}: {
  url: string;
  onPages: (pages: number) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  return (
    <Document
      file={url}
      onLoadSuccess={({ numPages }) => {
        setNumPages(numPages);
        onPages(numPages);
      }}
      loading={<div className="attachment-preview-empty">Loading PDF...</div>}
      error={<div className="result error">Failed to load PDF.</div>}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => (
        <div key={pageNo} className="attachment-pdf-page">
          <Page pageNumber={pageNo} width={760} renderAnnotationLayer={false} />
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
