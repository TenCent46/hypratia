# 18 — Attachments architecture

**Goal:** files (images, PDFs, future audio/video) live as real files on disk, referenced by relative path in Markdown and node frontmatter. Never as data URIs. Mirror Obsidian's `attachments/` model.

**Depends on:** MVP.

## Layout

```
<appData>/
  attachments/
    2026-04/
      <nanoid>.png
      <nanoid>.pdf
      <nanoid>.jpg
    2026-05/
      …
  conversations.json
  messages.json
  nodes.json
  edges.json
  settings.json
```

Foldering by `YYYY-MM` to keep any one directory under ~5 k entries. Filename is `<nanoid(16)>.<ext>` — sanitization burden = zero, dedup = nominal.

## Type addition

```ts
type Attachment = {
  id: ID;
  kind: 'image' | 'pdf' | 'audio' | 'video' | 'file';
  filename: string;            // <nanoid>.<ext>
  relPath: string;             // attachments/2026-04/<file>
  mimeType: string;
  bytes: number;
  width?: number;              // images only
  height?: number;
  pageCount?: number;          // pdfs only
  createdAt: string;
};
```

Stored in a sixth JSON: `attachments.json` (array). Referenced from `CanvasNode.attachments?: ID[]` and inline in markdown via `![alt](attachments/2026-04/<file>)`.

## Service

`src/services/attachments/AttachmentService.ts`

```ts
interface AttachmentService {
  // copies the source into appData; returns the metadata
  ingestFile(source: { path: string } | { bytes: Uint8Array; suggestedName: string; mimeType: string }): Promise<Attachment>;
  delete(id: ID): Promise<void>;
  // returns a webview-safe URL via convertFileSrc
  toUrl(att: Attachment): Promise<string>;
  list(): Promise<Attachment[]>;
}
```

`TauriAttachmentService` lives next to it; uses `tauri-plugin-fs` + `convertFileSrc` from `@tauri-apps/api/core`.

## Webview rendering

Tauri 2 lets the webview load `asset:` protocol URLs via `convertFileSrc`. Add the asset protocol to `tauri.conf.json`:

```json
"app": {
  "security": {
    "assetProtocol": { "enable": true, "scope": ["$APPDATA/attachments/**"] }
  }
}
```

Then `<img src={await attachments.toUrl(att)} />` works, no base64.

## Drop / paste flows

- **Drop on canvas:** if the dataTransfer has `Files`, ingest each → for image: create an image-typed canvas node; for PDF: create a pdf-typed canvas node (step 24); other: ignore for v1.0.
- **Drop on chat input:** ingest → insert markdown link or image embed at cursor.
- **⌘V paste in chat / inspector:** if clipboard has image, ingest → insert.
- **⌘V paste on canvas:** ingest → image node at viewport center.

## Architectural rule update

`services/attachments/` is the fourth platform-boundary service. ESLint config (eslint.config.js) gets a fourth allow path. Document in CLAUDE.md.

## Acceptance

- Drag a 5 MB JPG onto the canvas → file appears under `attachments/<yyyy-mm>/` and a node renders the image.
- Quit, relaunch → image still renders (path-based, not blob).
- `attachments.json` lists it.
- Obsidian export carries the file: copy from `<appData>/attachments/...` into `<vault>/LLM-Attachments/...` and rewrite relative paths in exported markdown.
- Deleting a node with attachments **does not** delete the underlying file (refs may exist elsewhere); a separate "garbage collect attachments" command lives in step 19.

## Risks

- Asset protocol scope must be tight enough to prevent user-controlled paths reading arbitrary files.
- Forgetting to write to `attachments.json` orphans the file (still visible if path is in markdown, but no metadata).
- Big files (>50 MB) — confirm dialog before ingest.
- `convertFileSrc` returns different URLs in dev vs prod; test both.
