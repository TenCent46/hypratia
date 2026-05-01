# 28 — Mirror Manual Re-Import (Markdown → Chat)

## Why

The original brief explicitly forbade automatic Markdown → chat
write-back: stale editor windows can clobber an in-flight stream, and a
single typo in `## User` boundaries can erase real conversation history.
The mirror banner therefore reads "edits don't sync back" — but users
asked for *some* path back. This spec adds the safest possible variant:
a deliberate, user-triggered re-import.

## Trigger

Available via:

- The editor context menu, item `Re-import to chat thread…` (only
  shown for files whose frontmatter declares `source: internal-chat`).
- The command palette: `Re-import current Markdown to chat thread`.
- Internally, anyone who dispatches `mc:editor-reimport`.

There is **no** automatic firing — the mirror sync runs JSON → Markdown
only, exactly as before.

## Implementation

`reimportMarkdownIntoChat(doc)`:

1. Parse the document with `gray-matter`. Reject if frontmatter
   `source !== 'internal-chat'`.
2. Reject if the conversation referenced by `frontmatter.conversationId`
   no longer exists.
3. Reject if any message in that conversation is currently `streaming`.
4. Walk the body, splitting on `## User` / `## Assistant` / `## System`
   headings. The first `*<iso>*` line in each section is parsed as the
   `createdAt`; otherwise we use `now()`.
5. Replace **all** of that conversation's messages atomically:
   `useStore.setState({ messages: [...everyone-else, ...parsed] })`,
   and update `conversation.messageIds` + `updatedAt`.

The "replace, don't merge" rule is intentional. The user is asking
"make the runtime match this Markdown" — merging would surprise them
when they delete a section and the message stays.

## Risks (still!)

- The user can still permanently lose messages by saving a malformed
  Markdown. The `Re-import` action belongs in a "destructive" tier of
  command. We do not gate it behind a confirm dialog in Phase 1 because
  the editor's own dirty-state path already gives the user a chance to
  back out before saving — but a future tightening should add a
  Save & re-import / Cancel dialog.
- If a chat stream starts while the user is editing, the streamed
  message will not appear in the Markdown. The streaming guard above
  catches that case at re-import time — it does not catch it at edit
  time.

These are documented limitations rather than blockers; tracked in the
Phase 3 backlog.

## Acceptance

1. The context menu shows the action only on mirrored files.
2. The action with no unsaved edits replaces the conversation's
   messages with the parsed Markdown.
3. Trying the action while the chat is streaming refuses with a clear
   toast.
4. Trying it on a non-mirror file refuses with a clear toast.
