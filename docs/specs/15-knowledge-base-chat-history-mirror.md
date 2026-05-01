# 15 — Knowledge Base: Chat History Mirror

## Why

The Knowledge Base section on the left of the sidebar is currently a thin
Markdown file explorer. It only shows files in
`settings.markdownStorageDir` (or the default `<appData>/LLM-Conversations`
fallback). Chat history lives separately in `conversations.json` /
`messages.json` / `projects.json` inside Tauri `appDataDir()`.

That split breaks the product promise: users expect the Knowledge Base to
be the visible local memory layer of the app — including their chats. They
should be able to open, search, and link to chat history as Markdown.

## What

JSON storage stays the runtime source of truth. We add a one-way
**JSON → Markdown** mirror so every conversation also exists as a
deterministic `.md` file inside the Knowledge Base root.

### Sync direction (Phase 1)

```
chat (JSON) ──▶ Markdown mirror (.md)
```

Two-way sync is explicitly out of scope. Editing the mirrored file does not
update the chat thread yet; the editor surfaces a banner explaining this.

## Folder layout

```
<knowledgeRoot>/
  Chats/
    YYYY-MM/
      <slug>--<conversationId>.md
  Projects/
    <project-slug>/
      <slug>--<conversationId>.md
```

- `YYYY-MM` comes from `Conversation.createdAt`.
- Conversations whose `projectId` resolves to a known project go under
  `Projects/<project-slug>/`. Anything else lands under `Chats/YYYY-MM/`.
- Project slugs are sanitised through the same `slugify()` used for the
  filename (see `services/export/filenames.ts`).

## Filename rules

`<slug>--<conversationId>.md`, where:

- `<slug>` is `slugify(conversation.title)` — empty titles fall back to
  `untitled`.
- The double-dash separator `--` keeps slug and id visually distinct.
- The conversationId suffix is the stable handle. Renaming the conversation
  rewrites the filename (slug part); the id-suffix never changes, so the
  mapping is recoverable from the filename even without an external
  side-table.

Filename sanitisation goes through the existing `slugify`/`safeFilename`
helpers — Windows reserved names are honoured even on macOS.

## Frontmatter

Every mirrored file carries:

```yaml
---
type: conversation
conversationId: <id>
projectId: <id or null>
title: <conversation title>
createdAt: <ISO timestamp>
updatedAt: <ISO timestamp>
source: internal-chat
schemaVersion: 1
---
```

Body layout:

```
# <Conversation title>

## User
<message body>

## Assistant
<message body>
…
```

Successive same-role messages are emitted as separate sections so the
Markdown reads in order.

## Overwrite safety

Before writing a mirror file we read its existing frontmatter:

- If the file does not exist → create.
- If `source === 'internal-chat'` **and** `conversationId` matches the
  conversation we are mirroring → overwrite is allowed (this is our own
  file).
- Otherwise → skip and `console.warn`. The user's hand-authored note is
  never clobbered.

Stale rename handling: when the conversation's slug changes we write the
new filename and call `markdownFiles.deletePath` on the old
`slug--<id>.md` — but only if its frontmatter identifies it as our own
mirror for the same `conversationId`. User-authored files at the old slug
are left in place.

## Sync trigger

`hydrateAndWire()` adds a Zustand subscription on `conversations` +
`messages` + `projects`. Changes are debounced (~700 ms) and dispatched to
`syncConversationMirror(state)`:

1. Resolve the Knowledge Base root from `settings.markdownStorageDir`.
2. Compare each conversation against a per-conversation last-synced
   signature kept in memory; only conversations whose signature changed are
   rewritten.
3. Each write is a single-file safe write (frontmatter check + atomic
   write via `markdownFiles.writeFile`).
4. Errors are logged to the console and surfaced via a `mc:knowledge-sync`
   `CustomEvent` so the explorer can show a transient toast.
5. After a successful pass we dispatch a `mc:knowledge-tree-refresh` event
   so the explorer re-reads the tree.

The sync is fire-and-forget; UI never awaits it.

## Mapping metadata

We do **not** store a separate `conversationId → mdPath` table. The mapping
is derived deterministically from frontmatter:

- `conversationId` is the canonical id.
- The filename always ends in `--<conversationId>.md`, so a one-pass scan
  of the tree (or any single file) recovers the mapping.

This avoids drift between an external map and the actual filesystem state.

## File-tree integration

The `MarkdownFileExplorer` already lists everything under the resolved
root. Mirror files appear automatically once written. The explorer:

- Listens for `mc:knowledge-tree-refresh` and re-runs `listTree`.
- Renders `Chats/` and `Projects/` like any other folder — no special
  casing.
- After loading the tree, asynchronously confirms candidate mirror files
  (filename matches `--<id>.md` AND lives under `Chats/` or `Projects/`)
  by reading their frontmatter and checking `source: internal-chat`. Only
  confirmed paths get the `chat` badge — the filename pattern alone is
  not enough.
- Exposes a "Sync now" button in the header that dispatches
  `mc:knowledge-sync-request`. The persistence layer listens for this
  event and runs the mirror immediately, bypassing the debounce.
- Surfaces transient toasts on `mc:knowledge-sync` events:
  - "Mirrored N conversation(s)." on a successful pass.
  - "Sync had K issue(s) — see console." when the result has per-conv
    errors.
  - "Knowledge Base sync failed: …" when the whole pass throws.

## Editor banner

`MarkdownDocumentEditor` parses frontmatter on load. If
`source === 'internal-chat'`, it renders a banner:

> This file is mirrored from chat history. Editing the Markdown file does
> not yet update the original chat thread.

Saving still works (so users can take notes on the file), but the next
mirror sync overwrites the body. We log this once in the banner copy.

## Out of scope (Phase 1)

- Two-way Markdown → chat sync.
- Semantic / vector search.
- Importing externally authored Markdown into chat threads.
- Selective mirroring (e.g. opt-out per conversation).

## Acceptance

1. Conversations remain in `conversations.json` / `messages.json`.
2. Each conversation also has a Markdown file under
   `<knowledgeRoot>/Chats/YYYY-MM/` or
   `<knowledgeRoot>/Projects/<slug>/`.
3. Frontmatter contains `conversationId`, `projectId`, `source`,
   `updatedAt`.
4. Renaming or extending a conversation updates the mirror within a debounce
   tick.
5. Files with foreign / missing `source: internal-chat` frontmatter are
   never overwritten.
6. The Knowledge Base tree shows mirror files; clicking opens them in the
   Markdown editor.
7. Existing chat UI, canvas UI, and manually authored notes are unaffected.
