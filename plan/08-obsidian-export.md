# 08 — Obsidian Markdown export

**Goal:** export everything to a user-chosen folder in an Obsidian-compatible structure.

**Depends on:** 07.

## Settings UI

- "Choose Obsidian vault" button → `dialog.open({ directory: true })`.
- Save path to `settings.obsidianVaultPath`.
- Show the current vault path. Show app data dir path too — first thing users ask.
- "Export to Markdown" button.

## Folder structure (under vault)

```
LLM-Conversations/{conversationId}.md
LLM-Nodes/{nodeId}.md
LLM-Maps/{conversationId}.json
```

## Per-node frontmatter

```yaml
---
id: <nodeId>
conversationId: <conversationId>
title: <title>
createdAt: <iso>
updatedAt: <iso>
tags: [tag1, tag2]
linkedNodeIds: [id1, id2]
sourceMessageId: <id-or-null>
---
```

Body = `contentMarkdown`. Cross-references use `[[node-{id}|{title}]]` — id is stable, title is the alias the reader sees.

## Per-conversation file

Plain markdown transcript with timestamps and roles. Append a `## Map` section linking each node: `[[node-{id}|{title}]]`.

## Per-map file

`LLM-Maps/{conversationId}.json` — node positions + edge list. JSON, not Markdown, because positions don't belong in prose.

## Service (`src/services/export/`)

- `ObsidianExporter.ts` — orchestrates writes. Public method `exportAll()`.
- `frontmatter.ts` — YAML serialize/parse via `gray-matter`.
- `filenames.ts` — sanitization:
  - NFC normalize.
  - Strip `/\:*?"<>|` and control chars.
  - Cap at 120 chars.
  - Avoid Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) **even on macOS**.
- Collision rule: read existing file's frontmatter; if `id` matches → overwrite. Else suffix `-2`, `-3`, etc.

## Safety

- Never call `removeFile` from the exporter.
- Never use user-controlled `title` to build a path; only sanitized id-based filenames.
- Read-then-write: refuse to overwrite a file whose frontmatter `id` doesn't match and isn't ours.

## Acceptance

- Pick a folder → it gets the three subfolders.
- Re-export with no changes → byte-identical output.
- Re-export after a node title change → the file updates; the rest are untouched.
- Open the vault in Obsidian → graph view shows links between node files.

## Risks

- Destroying user files. Mitigations above.
- Path traversal via crafted titles → never use title in paths.
- Filename collisions across nodes with similar titles → id-based naming sidesteps this.
- Auto-export creep — don't. Export is always a deliberate user action.
