# Hypratia / Memory Canvas — Live Spec

This spec captures the user's requirements as of 2026-04-27 and is the
authoritative checklist for the current iteration. Each item has a status
that is updated as work progresses.

## Legend

- ✅ done & verified
- ☑ implemented but unverified by user
- 🔧 partial / needs fixing
- ⏳ in progress
- ⬜ not started

---

## 1. Summarize → slash command

The chat input now shows a slash-command palette when the user types `/`.
`/summarize` triggers the existing summarizer pipeline and creates a card on
the canvas. `/new` starts a fresh chat. `/clear` clears the input.
The `<SummarizeButton>` is no longer rendered.

Files: `features/chat/MessageInput.tsx`, `features/chat/slashCommands.ts`,
`features/chat/ChatPanel.tsx` (handler).

Status: ☑

## 2. Obsidian-like Markdown editor

Auto-pair behavior added in `lib/textareaShortcuts.ts`:

- Selection + `*` `_` `` ` `` `"` `'` `(` `[` `{` → wraps with the matching pair.
- Without selection, `(` `[` `{` insert a balanced pair with cursor between.
- `Cmd+B` → bold, `Cmd+I` → italic, `Cmd+K` → `[selection](url)` with cursor on `url`.

Wired into `features/editor/MarkdownEditor.tsx` (used by DetachedNodeEditor
and NodeInspector).

Status: ☑

## 3. Claude file-creation tool

`services/llm/tools.ts` registers a `create_file` tool with the AI SDK. When
Claude/GPT/Gemini invokes it (any tool-capable provider), the file:

- Is ingested via `services/attachments/`, landing in `<appData>/attachments/...`.
- Becomes a card on the canvas, tagged `ai-generated`.
- Carries `attachmentIds: [att.id]` so it can be exported / opened.
- Markdown files render their content directly in the card; binary files show
  filename + media type.

`useChatStream` passes `conversationId` to the provider, so tools are bound
to the active conversation.

Status: ☑

## 4. Right-click context menu

`components/NodeContextMenu/NodeContextMenu.tsx` renders on `onNodeContextMenu`
in `CanvasPanel`. Items:

- Open in editor (uses the detached editor)
- Copy as Markdown
- Open with default app (when the node has an attachment)
- Show in Finder (uses `services/dialog.revealInFinder` → `revealItemInDir`)
- Move conversation to → (project submenu)
- Delete card

`services/dialog/Dialog` gained `revealInFinder` and `openWithSystem`. The
Tauri implementation calls `revealItemInDir` and `openPath` from
`@tauri-apps/plugin-opener`.

Status: ☑

## 5. Window separation — hardened

Root cause of "click does nothing": `capabilities/default.json` was scoped to
`windows: ["main"]` only AND missing `core:event:*` perms, so even on the main
window `listen('menu', ...)` got silently denied. Detached windows had **zero**
permissions so anything in them errored out.

Fixes:

- `windows: ["main", "chat-*", "canvas-*"]`
- `webviews: ["main", "chat-*", "canvas-*"]`
- Added `core:event:default` plus `allow-emit/listen/unlisten/emit-to`.
- Added `core:webview:default`, `core:webview:allow-create-webview-window`.
- Added `core:window:default`.
- Added `opener:allow-reveal-item-in-dir`, `opener:allow-open-path` for the
  context-menu Show-in-Finder.
- `services/window/openDetached` now uses a relative URL `/?view=...` (Tauri
  resolves correctly in both dev and prod), and logs `tauri://error` if the
  window fails to open.
- `useMenu` rebuilt with a stable ref + cancel guard so the listener is
  registered exactly once and doesn't leak.

Cross-window message DnD: the broadcast layer is in place (`drag-message-start` /
`drag-message-end`). HTML5 drag events still don't propagate across native
windows in WkWebView — known platform limitation; documented inline.

Status: ☑

## 6. Inline model picker (Claude.ai style)

`features/chat/ModelPicker.tsx` is a pill that lives in the bottom row of the
message input.

- Shows `[Active model · sublabel ▾]`. Sublabel = "Adaptive" when thinking is
  on, or "Effort: low/medium/high" for reasoning models.
- Click → popover with the active model card (tagline + checkmark), Adaptive-
  thinking toggle (only when `capabilities.thinking`), reasoning-effort segment
  (only when `capabilities.reasoning_effort`), and "More models →".
- "More models" opens a side flyout grouped by provider listing every enabled
  model (built-ins + custom + API-fetched).

`ChatHeader` no longer has the model dropdown — just mode pills + cost meter
+ optional Stop button.

Status: ☑

---

## Add-on requests received in this iteration

### 7. One-click expand on canvas card

The collapsed summary in `MarkdownNode` is now a button: a single click
expands the card to full markdown. The corner `▾`/`▴` toggle still works.
Keyboard: Enter / Space when focused.

Status: ☑

### 8. Global Map: per-project visibility + group drag

(carried over from previous sprint, verified still in place)

- Bottom-left panel in global mode lets the user check projects / orphan
  conversations to display.
- Default is empty — the user opts in to which sets to show.
- Double-click a node in global mode selects every node sharing that
  project (or that conversation if no project), allowing React Flow's native
  multi-select drag to move them as a group.

Status: ☑

### 9. macOS native menu — actually firing

Same root cause as #5 (capabilities). With `core:event` perms now present,
menu clicks emit and JS receives them. Manual verification still needed.

Status: ☑ (capabilities patched; user to confirm after rebuild)

---

## Verification

- `pnpm tsc --noEmit` — passing
- `pnpm lint` — passing
- `cargo check` — passing
- Rust menu-bar build incurs a Tauri rebuild on next `pnpm tauri dev`.

---

## Iteration 2 (chat input redesign + detach hardening)

### 10. Chat input redesigned to match Claude.ai layout

`MessageInput` is now a standalone rounded bubble:

- Top: textarea with "Reply…" placeholder.
- Bottom-row controls: `+` (attach) on the left; `🎤` (voice — placeholder, disabled) and a **blue circular send button** with an up-arrow on the right.
- Streaming: send button switches to a stop button.

Visual reference from user matches except the model pill (which moved to top
of chat per request 11).

Status: ☑ — verified via headless Chrome screenshot of localhost:1420.

### 11. Multi-tier model picker at top of chat (bug fix + redesign)

Bug: even after saving a Groq API key, the picker showed only OpenAI options.
Root cause: the previous Claude.ai-style flyout buried sibling-provider models
under "More models →", which users didn't discover.

Fix: rewrote `ModelPicker` as a **top-of-chat bar** with:

- `[Provider ▾]` — popover lists every enabled provider with model count + an
  "Add another provider…" link to Settings.
- `[Model ▾]` — popover lists every available model for the selected provider
  (built-ins + custom + API-fetched), each with a `thinking · reasoning · id`
  meta line.
- `[Adaptive thinking ☐/☑]` — only when the active model declares
  `capabilities.thinking`.
- `[Effort: low/medium/high]` — only when the active model declares
  `capabilities.reasoning_effort`.

The inline model pill in `MessageInput` is removed (replaced by the top bar).

Status: ☑

### 12. True OS-window detach — Rust-owned lifecycle

Hard rule: **the frontend must never call `new WebviewWindow()` directly.**
All window lifecycle is owned by Rust. The frontend signals intent and
listens for events.

Rust commands ([src-tauri/src/lib.rs](../src-tauri/src/lib.rs)):

- `detach_tab_to_window({ view, tabId? })` — creates a real native
  `NSWindow`-backed Tauri webview window via `WebviewWindowBuilder`. Loads
  `index.html?view=<view>&windowId=<id>&tabId=<id>`. Registers the tab in a
  Mutex<HashMap<String, String>> so we have one source of truth for
  `tabId → windowId`.
- `focus_window({ label })` — focus an existing detached window.
- `list_detached_windows()` — return the current `tabId → windowId` map.

Rust emits `window-lifecycle` events on every create / focus / close so the
frontend can stay in sync:

```ts
{ event: 'created' | 'focused' | 'closed',
  windowId: string,
  tabId: string | null,
  view: 'chat' | 'canvas' }
```

JS service ([src/services/window/index.ts](../src/services/window/index.ts))
exposes:

- `detachTabToWindow(view, tabId?)` — invokes the Rust command.
- `openDetached(view)` — convenience for menu paths without a specific tab.
- `focusDetached(label)`, `listDetachedWindows()`.
- `onWindowLifecycle(handler)` — subscribe to lifecycle events.
- `getInitialTabId()` / `getInitialWindowId()` — parse URL params on detached
  startup so the new window can open the conversation it was launched with.

App.tsx hydration: when a detached window opens with `?tabId=...`, the active
conversation is set to that id immediately after hydration.

Status: ☑

#### What's NOT done (future work — explicitly deferred per user spec)

- **Drag-to-detach gesture.** Currently a tab is detached via a button
  ("⧉" in chat header / canvas-toolbar) or via the File menu. The
  Chrome-style "drag a tab outside the window to detach" gesture is the next
  step. JS-side detection plan: on dragend over a window-edge boundary,
  call `detachTabToWindow`.
- **Tab reattach** (drag a detached window's title back into the main
  window's tab bar) — also future.

### 13. Hydration tolerant when storage fails

`hydrateAndWire` now wraps each `storage.loadJson` in a `safeLoad` that
catches and logs failures, falling back to defaults. Unblocks first-run UX
and makes headless-screenshot validation possible (the app renders even
without Tauri APIs available).

Status: ☑

---

## Screenshot validation method (for future iterations)

While the user's `pnpm tauri dev` is running:

1. The vite dev server is on `localhost:1420`.
2. Take a screenshot via headless Chrome:
   ```
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --headless --disable-gpu --no-sandbox \
     --window-size=1400,900 --virtual-time-budget=4000 \
     --screenshot=/tmp/hypratia.png http://localhost:1420/
   ```
3. Read `/tmp/hypratia.png` to inspect the web layer.

Limitations:
- Native window chrome (title bar, etc.) is **not** captured — only the
  webview contents.
- Tauri-only state (settings, conversations from JSON) is empty in this mode;
  the UI shows first-run / empty state.
- Multi-window detach can't be exercised this way.
