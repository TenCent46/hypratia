# 35 — Canvas Document Previewer Tabs

## Goal

Dragging files from Finder onto the canvas should turn local documents into
first-class workspace material:

- Images render directly on the canvas at the drop point.
- PDFs, PowerPoint, Word, and CSV files create canvas file cards and open a
  preview tab in the document pane.
- The Markdown editor pane becomes a tabbed document workspace, so multiple
  Markdown notes and file previews can be open together.

## Library Choices

- **PDF:** use the existing `react-pdf` + `pdfjs-dist` dependency. This is
  already installed and already used by the current PDF modal.
- **Images:** use the existing attachment URL flow and native `<img>`.
- **CSV:** no new dependency. Decode bytes with `TextDecoder` and parse a
  conservative RFC-4180 subset locally for preview tables.
- **DOCX/PPTX:** no new dependency for this pass. These formats are OOXML zip
  containers, so implement a small read-only extractor:
  - read the zip central directory;
  - inflate `deflate` entries with browser `DecompressionStream` when
    available;
  - extract text from `word/document.xml` and `ppt/slides/slide*.xml`.
- **Legacy `.doc` / `.ppt`:** do not attempt binary Office parsing. Show a
  metadata preview with an external-open action.

This avoids package installation while the app is being actively edited. A
future fidelity pass can add `mammoth` for DOCX or a dedicated Office preview
pipeline if layout-perfect rendering becomes necessary.

## Workspace Model

Add a local `WorkspaceDocTab` model in `App.tsx`:

```ts
type WorkspaceDocTab =
  | { id: string; kind: 'markdown'; path: string }
  | { id: string; kind: 'attachment'; attachmentId: string };
```

The markdown pane renders a small tab strip. The active tab renders either
`MarkdownDocumentEditor` or `AttachmentPreview`.

Events:

- `mc:open-markdown-file` opens/focuses a Markdown tab.
- `mc:open-attachment-preview` opens/focuses an attachment preview tab.

## Canvas Drop

Extend `ingestDroppedFiles`:

- image -> `image` node only;
- pdf -> `pdf` node + preview tab;
- docx/pptx/csv/doc/ppt/xlsx/text -> `artifact` node + preview tab;
- unsupported files are ignored for now.

Finder drops continue through `DataTransfer.files`, which is already used by
the canvas.

## Preview Behavior

PDF preview:

- scrollable pages in the document pane;
- external-open and reveal buttons;
- no selection-card feature in this tab pass. The older PDF modal can remain
  until it is replaced.

CSV preview:

- first rows rendered as a dense table;
- shows row/column counts where possible.

DOCX/PPTX preview:

- text-focused preview, not layout-perfect rendering;
- DOCX shows paragraph text;
- PPTX shows slide sections.

Unsupported Office preview:

- show file metadata and actions to open in the default system app or reveal in
  Finder.
