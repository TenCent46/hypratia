# 20 — Artifact UI in Chat & Canvas

Companion to [17-artifact-generation-pipeline.md](17-artifact-generation-pipeline.md).

## Chat artifact card

Rendered inside the assistant message row whenever the message has an
artifact attachment. Shows:

- file icon (by extension)
- filename (clickable → opens via Tauri opener)
- size (`12.4 KB`)
- provider badge (`Claude · code-execution`, `OpenAI · code-interpreter`,
  `OpenAI · TTS`)
- buttons: Open · Reveal in Finder · Add to canvas (if not already on
  canvas) · Copy path

Audio attachments additionally render an `<audio controls>` element under
the card. Video attachments render a video card with a placeholder
thumbnail (we do not generate thumbnails locally yet).

Component: [src/features/chat/ArtifactCard.tsx](../../src/features/chat/ArtifactCard.tsx).

## Save fenced code block as file

In `MessageList.tsx`, every fenced code block in an assistant message gets
a hover-revealed "Save as file" button. Clicking it:

1. Infers an extension from the language hint (`python` → `.py`,
   `markdown` → `.md`, etc.; falls back to `.txt`).
2. Prompts for a filename (prefilled with `snippet-<short-id>.<ext>`).
3. Calls `ArtifactService.createTextArtifact` with the block content.
4. Optionally adds to canvas (default off — user can add via the artifact
   card).

This covers the case where the model returns inline code instead of using
the `create_text_artifact` tool.

## Canvas artifact node

A new node kind: `artifact`. Reuses the dumb-card visual from `PdfNode`
but for any non-image, non-pdf attachment. Shows:

- icon by kind (`docx`, `pptx`, `xlsx`, `pdf`, `audio`, `video`, generic)
- title
- size + provider badge
- actions: Open · Reveal in Finder · Detach (delete node only, keep
  attachment)

The existing `MarkdownNode` keeps handling text/markdown artifacts that
the user wants editable inline — `create_text_artifact` with
`createCanvasNode: true` still goes through `addNode({ contentMarkdown:
content })` for `.md` so the user can keep editing on the canvas. Binary
artifacts always render as the generic artifact card; double-click opens
them in their default macOS app.

Component: [src/features/canvas/ArtifactNode.tsx](../../src/features/canvas/ArtifactNode.tsx).

## Knowledge Base mirroring

### Text mirror

`.md` artifacts (and any `text/*` with extension `.md`) write a real file
to the user's Markdown root via `markdownFiles.writeFile`. The file goes
under `Artifacts/<YYYY-MM>/<filename>` to keep generated content separate
from chat-mirror notes. Frontmatter:

```yaml
---
type: artifact
artifactType: markdown
artifactId: <id>
provider: <provider>
sourceConversationId: <id>
sourceMessageId: <id>
createdAt: <iso>
---
```

### <a id="sidecar"></a>Sidecar for binary artifacts

When the user enables `mirrorTextToKnowledgeBase` and produces a binary
artifact, the host writes a sidecar `.md` next to the binary's logical
location (`Artifacts/<YYYY-MM>/<basename>.md`). Body:

```markdown
---
type: artifact
artifactType: pptx
artifactId: <id>
localPath: attachments/2026-04/<id>.pptx
provider: claude-code-execution
sourceConversationId: <id>
sourceMessageId: <id>
createdAt: 2026-04-28T13:42:00.000Z
sizeBytes: 42561
---

# <title>

Generated `.pptx` lives at `attachments/2026-04/<id>.pptx`. Open via the
chat artifact card or use Reveal in Finder.
```

The binary itself stays under `attachments/` — we do not copy big files
into the user's vault unless they explicitly export.

## Settings UI block

Added to `SettingsModal` under the existing Vault & data tab, below the
Markdown storage controls:

- Document provider radio: **Claude (default)** / OpenAI
- TTS voice text input + format select
- "Mirror text artifacts to Knowledge Base" checkbox
- "Enable video generation (experimental, deprecating 2026)" checkbox

The system prompt editor gets a small append note: "Tools available:
create_text_artifact, create_document_artifact, create_audio_artifact[,
create_video_artifact]." This is informational; the actual tool list is
still authoritative.
