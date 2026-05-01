import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { Attachment, CanvasNode, PdfRef } from '../../types';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

type SelectionState = {
  page: number;
  text: string;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  // anchor coords are already adjusted to the body container's local coordinate space
  anchorLeft: number;
  anchorTop: number;
} | null;

export function PdfViewer() {
  const attId = useStore((s) => s.ui.pdfViewerAttachmentId);
  const setOpen = useStore((s) => s.setPdfViewer);
  const att = useStore((s) =>
    attId ? s.attachments.find((a) => a.id === attId) ?? null : null,
  );

  if (!attId || !att) return null;
  return (
    <PdfViewerInner attachment={att} onClose={() => setOpen(null)} />
  );
}

function PdfViewerInner({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const nodes = useStore((s) => s.nodes);
  const addNode = useStore((s) => s.addNode);
  const addEdge = useStore((s) => s.addEdge);
  const openAiPalette = useStore((s) => s.openAiPalette);
  const flow = useReactFlow();
  const [url, setUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [selection, setSelection] = useState<SelectionState>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let on = true;
    attachments.toUrl(attachment).then((u) => {
      if (on) setUrl(u);
    });
    return () => {
      on = false;
    };
  }, [attachment]);

  // The PDF node corresponding to this attachment (for back-edge)
  const pdfNode: CanvasNode | undefined = useMemo(
    () =>
      nodes.find(
        (n) => n.kind === 'pdf' && n.attachmentIds?.includes(attachment.id),
      ),
    [nodes, attachment.id],
  );

  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    let pageEl: HTMLElement | null = range.startContainer.parentElement;
    while (pageEl && !pageEl.dataset.mcPage) pageEl = pageEl.parentElement;
    if (!pageEl) {
      setSelection(null);
      return;
    }
    const page = Number(pageEl.dataset.mcPage);
    const pageRect = pageEl.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());
    const rects = clientRects.map((r) => ({
      x: (r.left - pageRect.left) / pageRect.width,
      y: (r.top - pageRect.top) / pageRect.height,
      w: r.width / pageRect.width,
      h: r.height / pageRect.height,
    }));
    const last = clientRects[clientRects.length - 1];
    const anchor = last ?? pageRect;
    const containerEl = containerRef.current;
    const containerRect = containerEl?.getBoundingClientRect();
    const scrollLeft = containerEl?.scrollLeft ?? 0;
    const scrollTop = containerEl?.scrollTop ?? 0;
    setSelection({
      page,
      text,
      rects,
      anchorLeft:
        (last ? anchor.right : pageRect.right) -
        (containerRect?.left ?? 0) +
        scrollLeft +
        6,
      anchorTop:
        (last ? anchor.bottom : pageRect.bottom) -
        (containerRect?.top ?? 0) +
        scrollTop +
        6,
    });
  }

  function makeCard(askAi: boolean) {
    if (!conversationId || !selection) return;
    const pdfRef: PdfRef = {
      attachmentId: attachment.id,
      page: selection.page,
      rects: selection.rects,
      text: selection.text,
    };
    const center = flow.screenToFlowPosition({
      x: window.innerWidth / 4,
      y: window.innerHeight / 2,
    });
    const body = `> ${selection.text.replace(/\n/g, '\n> ')}\n\n_(p. ${selection.page} of ${attachment.filename})_`;
    const node = addNode({
      conversationId,
      title: selection.text.slice(0, 60),
      contentMarkdown: body,
      position: center,
      tags: ['pdf-quote'],
      pdfRef,
      attachmentIds: [attachment.id],
    });
    if (pdfNode) {
      addEdge({
        sourceNodeId: pdfNode.id,
        targetNodeId: node.id,
        label: `p. ${selection.page}`,
      });
    }
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    if (askAi) {
      openAiPalette(selection.text, `pdf:${attachment.id}:${selection.page}`);
    }
  }

  function quoteToClipboard() {
    if (!selection) return;
    const md = `> ${selection.text.replace(/\n/g, '\n> ')}\n\n_(p. ${selection.page} of ${attachment.filename})_`;
    void navigator.clipboard.writeText(md);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pdf-viewer" onClick={(e) => e.stopPropagation()}>
        <header className="pdf-viewer-header">
          <span>{attachment.filename}</span>
          <span className="muted">{numPages ? `${numPages} pages` : ''}</span>
          <button type="button" className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div
          className="pdf-viewer-body"
          ref={containerRef}
          onMouseUp={captureSelection}
          onTouchEnd={captureSelection}
        >
          {url ? (
            <Document
              file={url}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              loading={<div className="muted">Loading PDF…</div>}
              error={<div className="result error">Failed to load PDF.</div>}
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => (
                <div
                  key={pageNo}
                  className="pdf-page"
                  data-mc-page={pageNo}
                >
                  <Page
                    pageNumber={pageNo}
                    width={720}
                    renderAnnotationLayer={false}
                  />
                  <div className="pdf-page-label muted">page {pageNo}</div>
                </div>
              ))}
            </Document>
          ) : null}
          {selection ? (
            <div
              className="pdf-action-bar"
              style={{ left: selection.anchorLeft, top: selection.anchorTop }}
            >
              <button type="button" onClick={() => makeCard(false)}>
                Card
              </button>
              <button type="button" onClick={() => makeCard(true)}>
                Card + Ask AI
              </button>
              <button type="button" onClick={quoteToClipboard}>
                Quote
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelection(null);
                  window.getSelection()?.removeAllRanges();
                }}
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
