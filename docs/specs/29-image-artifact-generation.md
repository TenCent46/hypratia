# 29 — Image Artifact Generation

Companion to [17-artifact-generation-pipeline.md](17-artifact-generation-pipeline.md).
Extends the artifact pipeline so the model can produce real image files
(`.png` / `.jpeg` / `.webp`) the same way it already produces `.pptx` and
`.mp3`.

## Why

Today the chat can ask the model "draw a diagram of X" only as text.
`ArtifactKind` is `'text' | 'document' | 'audio' | 'video'` (see
[`services/artifacts/types.ts`](../../src/services/artifacts/types.ts)),
so there is no path that turns a prompt into a binary image attachment.
We have an `ImageNode` on the canvas already (used for pasted / dropped
images), so once we land bytes in `attachments/` the canvas/chat surface
is already wired — the missing piece is the provider call and the tool.

## Architecture

Reuses the spec-17 shape:

```
features/chat ── tool call ──▶ services/llm/tools.ts (create_image_artifact)
                                     │
                                     ▼
                            services/artifacts/ArtifactService
                                     │
                                     ▼
                       OpenAIImageArtifactProvider
                          (gpt-image-1, /v1/images/generations)
```

`ArtifactKind` gains `'image'`. `ArtifactRequest` gains an `image` variant.
No other service changes its public surface.

## Type changes

```ts
// src/services/artifacts/types.ts

export type ArtifactKind = 'text' | 'document' | 'audio' | 'video' | 'image';

export type ImageFormat = 'png' | 'jpeg' | 'webp';
export type ImageSize =
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | 'auto';
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';
export type ImageBackground = 'transparent' | 'opaque' | 'auto';

export type ArtifactProviderId =
  | 'host-text'
  | 'claude-code-execution'
  | 'openai-code-interpreter'
  | 'openai-audio'
  | 'openai-video'
  | 'openai-image';

// ArtifactRequest gains:
| {
    kind: 'image';
    prompt: string;
    size?: ImageSize;
    quality?: ImageQuality;
    format?: ImageFormat;
    background?: ImageBackground;
  }
```

`ProviderUsage` already covers token-style billing; for images add an
optional `imageCount?: number` so the cost UI later can multiply by
per-image price.

## Tool surface

New tool registered in [`services/llm/tools.ts`](../../src/services/llm/tools.ts)
when an OpenAI key is configured:

- **`create_image_artifact`**
  - `prompt: string` — required, detailed visual brief
  - `filename?: string` — defaults to `image.<ext>`
  - `size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto'`
  - `quality?: 'low' | 'medium' | 'high' | 'auto'`
  - `format?: 'png' | 'jpeg' | 'webp'` — defaults to `png`
  - `background?: 'transparent' | 'opaque' | 'auto'` — only honored
    when `format === 'png'` or `'webp'`
  - `title?: string`
  - `saveToKnowledgeBase?: boolean`
  - `createCanvasNode?: boolean`

The tool description must steer the model away from base64-pasting bytes
into chat — same wording pattern as `create_document_artifact`.

## Provider — OpenAI `gpt-image-1`

Endpoint: `POST https://api.openai.com/v1/images/generations`

Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`.

Request:

```json
{
  "model": "gpt-image-1",
  "prompt": "<prompt>",
  "size": "1024x1024",
  "quality": "high",
  "output_format": "png",
  "background": "transparent",
  "n": 1
}
```

Response: JSON with `data[0].b64_json`. Decode base64 → `Uint8Array` →
`attachments.ingest`. Detected MIME comes from `format` (we do not trust
the model's `output_format` echo blindly).

Failure model mirrors spec 18:

| Failure                    | Behavior                                          |
| -------------------------- | ------------------------------------------------- |
| no API key                 | `{ ok: false, error: 'missing-openai-key' }`      |
| HTTP 4xx                   | surface error text                                |
| `data` empty               | `{ ok: false, error: 'no-image-generated' }`      |
| base64 decode fails        | `{ ok: false, error: 'decode-failed' }`           |
| moderation block           | surface OpenAI's policy error verbatim            |

Per-call cost is billed by image, not tokens. We do not poll — the
endpoint returns synchronously (gpt-image-1 is not a long-running job
unlike Sora 2).

## Storage contract

Bytes go to `attachments/YYYY-MM/<id>.<ext>` like every other artifact.
The `kind` resolved by `attachments.ingest` is `'image'` (already
auto-detected from MIME `image/*`). KB mirroring follows
spec 17's binary rule: optional sidecar `.md` under
`Artifacts/<YYYY-MM>/<basename>.md` with frontmatter
`artifactType: image`, plus the prompt copied into the body so the user
can find the image later by searching the prompt text.

## UI

### Chat artifact card

[`features/chat/ArtifactCard.tsx`](../../src/features/chat/ArtifactCard.tsx)
gains an inline `<img>` preview for `kind === 'image'`, capped at
`max-height: 240px` and `object-fit: contain`. Click → opens via Tauri
opener (default OS image viewer). Long-press / right-click goes through
the existing artifact card menu (Open · Reveal in Finder · Add to
canvas · Copy path).

A small disclosure label `AI-generated image · gpt-image-1` sits below
the preview, matching the TTS card pattern.

### Canvas

`ImageNode` already renders attachments by `attachmentId`. When the
tool runs with `createCanvasNode: true`, `ArtifactService` calls
`addNode({ kind: 'image', attachmentId, ... })` instead of
`addNode({ kind: 'artifact' })`. No new node type.

## Settings

Extend `Settings.artifacts`:

```ts
artifacts?: {
  // ...existing keys
  imageProvider?: 'openai';        // only option for now
  imageDefaultSize?: ImageSize;    // default 'auto'
  imageDefaultQuality?: ImageQuality; // default 'auto'
  imageDefaultFormat?: ImageFormat;   // default 'png'
};
```

`SettingsModal` gets a new row in the artifacts block: a size select, a
quality select, and a format select. No provider radio yet — we ship
with one provider and add the radio when a second arrives.

## Hard rules

- Image bytes never cross a `z.string()` boundary in the tool surface.
  The b64 string from the provider is decoded inside the provider
  adapter and passed as `Uint8Array`.
- Filenames go through `normalizeFilename(raw, expectedExt)` — same
  slugifier as the rest of the pipeline.
- `format` and the file extension always agree. If the model passes
  `filename: 'logo.jpeg'` but `format: 'png'`, we trust `format` and
  rewrite the extension. (The model frequently disagrees with itself.)
- A failed generation leaves no half-written attachment and no canvas
  node.
- Moderation errors are surfaced verbatim. We do not retry, do not
  reword the prompt, do not silently fall back.

## Acceptance

1. `pnpm tsc --noEmit` clean after the `ArtifactKind` extension.
2. Asking the chat for an image produces a real `.png` (or chosen
   format) under `attachments/YYYY-MM/`, an artifact card with inline
   preview in chat, and an `ImageNode` on the canvas when
   `createCanvasNode` is true.
3. The same flow works without an OpenAI key only insofar as the tool
   is *not* registered — the model never sees `create_image_artifact`
   when no key is present.
4. `mirrorTextToKnowledgeBase` produces a sidecar `.md` containing the
   prompt and the relative path to the binary, never the binary
   itself.
5. Right-click on the artifact card / canvas node opens the existing
   menus; no new menu surface required.
6. Switching `imageDefaultFormat` to `webp` and asking for an image
   produces a `.webp` whose bytes start with the WebP magic
   (`52 49 46 46 ... 57 45 42 50`).

## Out of scope

- Image **edits** (`/v1/images/edits`) and **variations**
  (`/v1/images/variations`). Both need a source image upload step and a
  mask UI; they earn their own spec when we wire up canvas-region
  selection as input.
- Multi-image grids (`n > 1`). The current tool exposes one image per
  call. Multiple calls are cheap and keep the artifact card simple.
- Local image models (Stable Diffusion, ComfyUI). Out of scope for the
  first cut; would slot in as a second provider behind the same tool.
- Imagen via Gemini. Slot it in once we add a Google API key surface to
  `services/secrets/`. The tool shape does not need to change.
- Inpainting / outpainting on the canvas. Future spec.
