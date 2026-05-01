# 19 — OpenAI Audio & Video Generation

Companion to [17-artifact-generation-pipeline.md](17-artifact-generation-pipeline.md).

## Audio (TTS)

Endpoint: `POST https://api.openai.com/v1/audio/speech`

Request:

```json
{
  "model": "gpt-4o-mini-tts",
  "input": "<text>",
  "voice": "coral",
  "response_format": "mp3",
  "instructions": "<optional style>"
}
```

Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`.

Response: binary audio bytes. We `await response.arrayBuffer()` and pass the
`Uint8Array` to `attachments.ingest`. The attachment kind is auto-detected
from the MIME (`audio/mpeg` → `audio`).

UI behavior: the chat artifact card renders an `<audio controls>` element
sourced from `attachments.toUrl(att)`. A small "AI-generated audio"
disclosure label sits below the player.

Voices are exposed as a free-form string in settings (`ttsVoice`), defaulting
to `coral`. We do not try to keep up with OpenAI's voice list — the user can
type any voice the API currently accepts.

## Document generation via OpenAI Code Interpreter

Endpoint: `POST https://api.openai.com/v1/responses`

Body:

```json
{
  "model": "gpt-5",
  "input": "Create a .docx ... save it as <filename>.",
  "tools": [{ "type": "code_interpreter", "container": { "type": "auto" } }]
}
```

Response: scan `output[].content[].annotations[]` for any node shaped:

```json
{
  "type": "container_file_citation",
  "container_id": "cntr_...",
  "file_id": "cfile_...",
  "filename": "..."
}
```

Download:

`GET https://api.openai.com/v1/containers/{container_id}/files/{file_id}/content`

with `Authorization: Bearer <key>`. Body is the file bytes. Same ingest
path as the Claude provider.

This adapter is wired up but the UI default for `documentProvider` is
`'claude'`. Users can switch in Settings.

## Video (Sora 2) — feature-flagged

⚠ The OpenAI Videos API and Sora 2 are slated for deprecation in 2026.
This adapter is implemented but **off by default**
(`settings.artifacts.videoEnabled: false`) and registered as a tool only
when the flag is on. We will not depend on it as a core feature.

Flow:

1. `POST https://api.openai.com/v1/videos` with `{ model: 'sora-2',
   prompt, seconds, size }` → returns `{ id }`.
2. Poll `GET /v1/videos/{id}` every 5s, up to a 10-minute cap, until
   `status === 'completed'` or `status === 'failed'`.
3. On completion: `GET /v1/videos/{id}/content` → binary bytes.
4. Ingest as `.mp4` via `attachments.ingest`.

If any step fails (no key, deprecated, access denied, timeout), the tool
returns `{ ok: false, error: '<reason>' }`. The chat surface shows the
reason and does not crash.

## Cost notes

- TTS bills per-character, very cheap; no special UI yet.
- Code interpreter and video are charged per request and per session
  duration; show cost in the artifact card later.
- Both providers can fail with rate limits — the tool error message is
  passed straight through.
