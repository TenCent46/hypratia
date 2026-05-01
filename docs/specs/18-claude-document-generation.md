# 18 — Claude Document Generation (code execution)

Companion to [17-artifact-generation-pipeline.md](17-artifact-generation-pipeline.md).

## Why Claude code execution

The Anthropic Messages API exposes a server-side Python sandbox via the
`code_execution_20250825` tool. The model writes a small Python script using
`python-docx`, `python-pptx`, `openpyxl` / `xlsxwriter`, or `reportlab`, the
sandbox runs it, and the resulting file is exposed via the Files API. We
download the bytes through the Files API and ingest them as a normal
attachment. This is the only way to get a real `.pptx` out of Claude without
running Python on the user's machine.

## Endpoint

`POST https://api.anthropic.com/v1/messages`

Headers:

```
x-api-key: <secret>
anthropic-version: 2023-06-01
anthropic-beta: code-execution-2025-08-25,files-api-2025-04-14
anthropic-dangerous-direct-browser-access: true
content-type: application/json
```

The `dangerous-direct-browser-access` header is required because the
Tauri webview behaves like a browser. We accept the risk: the key is the
user's own, stored in `services/secrets/`, never reused server-side.

## Request body

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 8192,
  "tools": [{ "type": "code_execution_20250825", "name": "code_execution" }],
  "messages": [
    {
      "role": "user",
      "content": "Create a .pptx ... save the final file as exactly \"<filename>\"."
    }
  ]
}
```

Model selection rule: read `settings.defaultModel` if it is an Anthropic
model that supports code execution (`claude-sonnet-4-5`,
`claude-opus-4-5`, `claude-haiku-4-5`, plus the Claude 4.6 / 4.7 line). If
the configured model does not, fall back to `claude-sonnet-4-5`.

## Response handling

The response contains alternating `tool_use` and `tool_result` blocks. The
`tool_result.content` for a code-execution call includes a
`code_execution_tool_result` whose `content` array references generated
files. Defensively scan the entire response tree for nodes shaped like:

```json
{ "type": "code_execution_output", "file_id": "file_..." }
```

For each `file_id` (deduplicated by id), download:

`GET https://api.anthropic.com/v1/files/{file_id}/content`

with the same auth + beta headers. The response body is the file bytes.
The filename returned by the model is honored if it matches the requested
extension; otherwise we fall back to the requested filename.

## Error model

| Failure                              | Behavior                          |
| ------------------------------------ | --------------------------------- |
| no API key                           | tool returns `{ ok: false, error: 'missing-anthropic-key' }` |
| HTTP 4xx                             | surface error text to the chat    |
| 0 generated files                    | `{ ok: false, error: 'no-file-generated' }` |
| download HTTP 4xx                    | log + return error                |
| download succeeds but bytes empty    | `{ ok: false, error: 'empty-file' }` |

A successful run returns one `ArtifactResult` per generated file (we expect
one per request; we ingest all if the model produced extras).

## Cost & safety notes

- Code execution tokens are billed separately by Anthropic; surface in the
  cost UI later.
- The Python sandbox runs on Anthropic infrastructure, never the user's
  machine. We do not exec local Python.
- Files API content download is binary; it is written to disk via
  `attachments.ingest({ kind: 'bytes' })` which already does atomic-style
  writes.
