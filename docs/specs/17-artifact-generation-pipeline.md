# 17 — Artifact Generation Pipeline

## Why

The previous `create_file` tool ([src/services/llm/tools.ts](../../src/services/llm/tools.ts))
shoved a `z.string()` content field through the AI SDK toolset and called
`attachments.ingest` directly. That works for `.md` / `.txt` / source code but
silently breaks for binary formats (`.docx`, `.pptx`, `.xlsx`, `.pdf`, `.mp3`,
`.mp4`) because the model cannot — and must not — emit raw binary as a string.

We need a pipeline that:

1. Treats text artifacts and binary artifacts as separate code paths.
2. Routes binary generation to provider-side sandboxes (Claude code execution,
   OpenAI code interpreter, OpenAI TTS, OpenAI video).
3. Centralizes "where does the bytes go on disk" so we can mirror text
   artifacts into the user's Knowledge Base without each tool reimplementing
   it.
4. Exposes a small, typed surface to the rest of the app: `ArtifactService`.

## Architecture

```
features/chat ── tool call ──▶ services/llm/tools.ts (tool wrappers)
                                     │
                                     ▼
                            services/artifacts/ArtifactService
                                     │
            ┌────────────────────────┼────────────────────────────┐
            ▼                        ▼                            ▼
   text path (in-band)        provider adapters             KB mirror
                                     │
              ┌──────────────────────┼─────────────────────────────┐
              ▼                      ▼                             ▼
   ClaudeCodeExecutionArtifact   OpenAICodeInterpreterArtifact   OpenAIAudio
   (.docx/.pptx/.xlsx/.pdf)      (.docx/.pptx/.xlsx/.pdf)        (.mp3/.wav)
                                                                   │
                                                            OpenAIVideo (flagged)
```

`services/artifacts/` is **not** in the Tauri import allowlist. It delegates
binary writes to `services/attachments/` and Markdown writes to
`services/storage/MarkdownFileService.ts`. Provider adapters call the LLM
provider HTTPS API directly via `fetch`, using keys from `services/secrets/`.

## Tool surface (model-facing)

The host registers these tools per conversation:

- **`create_text_artifact`** — text/markdown/code, text-safe extensions only.
- **`create_document_artifact`** — `.docx` / `.pptx` / `.xlsx` / `.pdf`. Routes
  through `ClaudeCodeExecutionArtifactProvider` (default) or
  `OpenAICodeInterpreterArtifactProvider` based on
  `settings.artifacts.documentProvider`.
- **`create_audio_artifact`** — TTS via OpenAI `audio/speech`.
- **`create_video_artifact`** — Sora 2 video generation. Only registered when
  `settings.artifacts.videoEnabled === true`.

All tools accept a host-validated filename and return a stable
`ArtifactResult { artifactId, filename, mimeType, attachmentId, nodeId?,
knowledgeBasePath?, sizeBytes, provider }`.

## Storage contract

| Kind          | Bytes location                               | KB mirror                                    |
| ------------- | -------------------------------------------- | -------------------------------------------- |
| text/markdown | `attachments/YYYY-MM/<id>.<ext>`             | optional; real file written to KB root      |
| text/other    | `attachments/YYYY-MM/<id>.<ext>`             | optional; sidecar `.md` if user requests it  |
| office/pdf    | `attachments/YYYY-MM/<id>.<ext>`             | sidecar `.md` only                          |
| audio/video   | `attachments/YYYY-MM/<id>.<ext>`             | sidecar `.md` only                          |

Sidecar template: see [20-artifact-chat-canvas-ui.md](20-artifact-chat-canvas-ui.md#sidecar).

## Hard rules

- Binary content **never** crosses a `z.string()` boundary.
- Filename sanitization uses `services/export/filenames.ts` (`safeFilename`).
- Path traversal: artifact filenames are slugified and hard-capped at 120
  chars; absolute paths and `..` segments are stripped.
- API keys are read from `services/secrets/` only; never logged.
- The user's existing `attachments/` directory layout is unchanged.
- A failed provider call leaves no half-written attachment record — bytes go
  through `attachments.ingest` only after a successful download.

## Settings surface

Added to `Settings`:

```ts
artifacts?: {
  documentProvider?: 'claude' | 'openai';
  audioProvider?: 'openai';
  videoEnabled?: boolean;
  ttsVoice?: string;
  ttsFormat?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac';
  mirrorTextToKnowledgeBase?: boolean;
};
```

Defaults: `documentProvider: 'claude'`, `ttsVoice: 'coral'`,
`ttsFormat: 'mp3'`, `videoEnabled: false`,
`mirrorTextToKnowledgeBase: true`.

## Acceptance

See AC list in the originating task. Concretely:

1. `pnpm tsc --noEmit` clean.
2. Existing chat / canvas / Markdown explorer flows untouched.
3. Asking Claude for a `.pptx` produces a real `.pptx` in
   `attachments/YYYY-MM/`, an artifact card in chat, and an artifact node on
   the canvas.
4. Asking for a `.md` still works, and the file appears under the user's
   Markdown root when `mirrorTextToKnowledgeBase` is on.
5. Asking for video errors clearly when `videoEnabled` is off, and works
   when on (subject to API access).
