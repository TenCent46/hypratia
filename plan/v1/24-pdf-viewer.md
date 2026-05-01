# 24 — Images + basic PDF viewer

**Goal:** images embed inline; PDFs render as a canvas node with paginated viewer.

**Depends on:** 18.

## Images

- New canvas node type: `image` — renders the attachment via `convertFileSrc` URL.
- In Markdown body of any node, `![[attachment-id]]` resolves to the image (handled by transclusion plugin in 17).
- Drop image on canvas → image node at drop point.
- Drop image into chat → `![alt](attachments/...)` inserted at cursor.
- Paste from clipboard → ingest then insert.
- Image node renders at natural-size up to 480×360, then scales down preserving aspect.

## PDFs

- New canvas node type: `pdf` — renders pages via `react-pdf` (PDF.js).
- Default render: first page only, with a "page X / N" footer that opens the full viewer.
- Full viewer is a modal (or side panel) showing all pages, virtualized via `react-window`.
- The card-on-canvas remains a small handle even when the modal viewer is open.

## Stack additions

```
pnpm add react-pdf pdfjs-dist react-window
```

Worker setup:

1. Copy `pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdf.worker.min.mjs` at build time (vite plugin or postinstall).
2. `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`.
3. Copy `cmaps/` and `standard_fonts/` to `public/` so CJK and exotic fonts render.

CSP additions in `tauri.conf.json`:
```
"csp": "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; img-src 'self' data: asset:; connect-src 'self' …;"
```

## Files

- `src/features/canvas/ImageNode.tsx`
- `src/features/canvas/PdfNode.tsx`
- `src/features/pdf/PdfViewer.tsx` — full-screen modal viewer with virtualization.
- `src/features/pdf/usePdfDocument.ts` — caches loaded PDF documents (one per attachment id).
- `vite.config.ts` plugin — copy worker + cmaps + fonts at build.

## Acceptance

- Drag a 50-page PDF → it renders page 1 inside a card; clicking opens the modal viewer; scrolling is smooth (only visible pages render).
- Reload → card still shows; full viewer state (page, zoom) does not need to persist for v1.0.
- Theme change → viewer chrome updates, page background remains white (PDFs render to canvas, can't easily theme — keep page white in all themes, just style the chrome).
- 200 MB PDF — opens, doesn't OOM (virtualization holds).

## Risks

- PDF.js worker setup is finicky; test in `pnpm tauri build` (release), not just dev.
- Memory leak risk on PDF unmount — make sure `pdfDocument.destroy()` is called.
- Some PDFs have JS / forms — disable them in PDF.js options (security + perf).
- Asset protocol scope must include the attachments path (already configured in 18).
