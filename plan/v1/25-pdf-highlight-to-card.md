# 25 — PDF highlight → linked card (the differentiator)

**Goal:** select text inside a PDF page → press a single key (or click "Send to canvas") → a new Markdown node with the highlighted text lands on the canvas, edge drawn back to the PDF node, with a `pdfRef` frontmatter pointing to the page + bounding rect.

**Depends on:** 24, 23.

## Why

This is the single feature, surveying every comparable tool, that maps most cleanly onto Memory Canvas's chat-+-canvas model. Heptabase has it for whiteboards-only; nobody combines it with a chat. It's the v1.0 moat.

## Behaviour

1. Open a PDF in viewer.
2. Drag-select text on a page (PDF.js renders a text layer; default browser selection).
3. A small floating action bar appears near the selection: **Card** · **Card + Ask AI** · **Quote** · ✕.
4. **Card** → creates a Markdown node containing the quoted text + a pdfRef.
5. **Card + Ask AI** → opens the AI palette (23) with the selection pre-filled.
6. **Quote** → copies a Markdown blockquote with citation to clipboard.
7. The new card is placed on the canvas near the PDF node, with an edge drawn back to the PDF node. Edge label: "p. N".

## Data model addition

```ts
type PdfRef = {
  attachmentId: ID;
  page: number;
  rects: Array<{ x: number; y: number; w: number; h: number }>;  // normalized 0..1
  text: string;
};

// in CanvasNode frontmatter export:
type CanvasNode = {
  …
  pdfRef?: PdfRef;
};
```

`pdfRef` exports as YAML frontmatter; on next open, the PDF viewer can highlight the rect and click-jumps from card → page.

## Files

- `src/features/pdf/PdfTextLayer.tsx` — wraps `react-pdf`'s `<Page>` with a custom selection layer that knows how to map browser selection → page coords.
- `src/features/pdf/HighlightActionBar.tsx`
- `src/features/pdf/highlightUtils.ts` — DOM Range → normalized rects.
- Extend `CanvasPanel` to draw the back-edge automatically when a `pdfRef` node is created.

## Implementation outline

1. `react-pdf` already renders a text layer. Hook into its `onRenderTextLayer` to attach mouseup/touchend listeners.
2. On selection settle (selection `Range` non-empty), compute bounding rects relative to the page canvas, normalize to 0..1.
3. Render the action bar at the bottom-right of the selection rect (positioned absolutely inside the page).
4. **Card** action: ingest the text into a new node; store `pdfRef`. Add edge from new node → existing PDF node.
5. Open the new node's page in the canvas; the user sees the card appear with a small animation.
6. Reverse navigation: clicking the back-edge in the canvas opens the PDF viewer at that page with the rect highlighted.

## Acceptance

- Select a paragraph in a PDF → action bar appears next to the selection → **Card** → a new node arrives on the canvas with the text and an edge to the PDF.
- The exported `<vault>/LLM-Nodes/<id>.md` has YAML `pdfRef` block with `page` and `rects`.
- Click the back-edge → PDF viewer opens at the page with the highlighted rect.
- Selection across page boundaries is rejected (with a small toast); v1.0 supports single-page selections only.

## Risks

- PDF.js text layer DOM is fragile; selection rects on rotated / scanned PDFs can be off.
- For scanned PDFs (no text layer), selection won't work — flag in the action bar (greyed out with a tooltip "OCR required, coming in v1.1").
- Rect normalization must survive zoom — store normalized coords (0..1), recompute pixel rects at display time.
- Performance: selection on a 200-page PDF must not iterate all pages — only the current page's text layer.
