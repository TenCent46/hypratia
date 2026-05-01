# Implementation Change Log

## 2026-04-28 22:30 — Artifact Pipeline Follow-Up: Canvas Node, Per-Block Save, Usage, Validation, Toast

Agent:
- Claude

Summary:
- New canvas node kind `'artifact'`. Binary artifacts (`.docx`, `.pptx`,
  `.xlsx`, `.pdf`, audio, video) now render as a dedicated card with a
  filename, size, provider badge, and Open / Reveal actions instead of
  falling back to the generic markdown card. Double-clicking opens the
  file in the OS default app.
- `MarkdownRenderer` accepts an optional `onSaveCodeBlock` prop. When
  set, every fenced code block in an assistant message gains a
  hover-revealed "⤓ Save" button that calls `ArtifactService.create()`
  with the block's content and inferred extension. The per-message
  fallback action is unchanged (still useful when the user wants to
  pick a specific block by index).
- Artifact provider responses now carry `usage` (tokens / characters /
  seconds). `ArtifactService.commit` records each call into a new
  in-memory `artifactUsage` ring buffer (cap 200, newest first). The
  Usage settings tab renders a new "Artifact generation (this session)"
  table with per-row provider, kind, filename, in/out tokens,
  characters, seconds, and size.
- TTS voice and Sora model/size are now validated against soft
  allowlists in the providers; an unknown value fails fast with a
  readable error instead of an opaque 400 from the provider.
- Streamed progress toast: `ArtifactService` dispatches
  `mc:artifact-progress` `CustomEvent`s with `start` / `success` /
  `error` phases. A new `ArtifactProgressToast` component mounted
  inside `ChatPanel` renders a transient "Generating .pptx via Claude…"
  toast that flips to a success or error state. Toasts auto-dismiss
  (5 s success, 8 s error). Text-only artifacts skip the toast since
  they don't make a network call.
- Pre-existing CanvasPanel lint errors fixed: dropped a dead `let
  answer = ''` initializer (line 778) and deferred the search
  `runSearch` call to a `setTimeout(0)` so it no longer trips
  `react-hooks/set-state-in-effect`.

Approach:
1. Added `'artifact'` to `CanvasNodeKind`. Created
   `src/features/canvas/ArtifactNode.tsx` modeled on `PdfNode`. Updated
   the `nodeTypes` map and the dispatch in `CanvasPanel.tsx` to route
   non-image / non-pdf attachment-bearing nodes through it.
   `ArtifactService.commit` now sets `kind: 'markdown'` for `.md`
   artifacts (so they remain editable inline) and `kind: 'artifact'`
   for everything else.
2. `MarkdownRenderer` got a `pre` component override: when
   `onSaveCodeBlock` is provided it renders a wrapping `div.md-codeblock-wrap`
   with an absolutely-positioned hover button that pulls the code +
   language from the inner `<code class="language-…">` child. Inline
   code is unaffected (the override only fires on `<pre>`).
3. `ProviderGenerateOutput` grew an optional `usage`. Each provider
   parses what it can:
   - Claude / OpenAI Code Interpreter: `usage.input_tokens` and
     `usage.output_tokens` from the response root.
   - OpenAI TTS: `characters: text.length`.
   - OpenAI Sora: `seconds` requested.
   `ArtifactService.commit` calls `store.recordArtifactUsage` with the
   normalized record. The store keeps a ring buffer of 200 entries and
   the Usage tab renders the table.
4. Voice / size validation lives in the providers themselves —
   `OpenAIAudioArtifactProvider` keeps a `KNOWN_VOICES` set, the video
   provider keeps `KNOWN_MODELS` + `KNOWN_SIZES`. Both throw
   `unknown-voice` / `unknown-size` / `unknown-model` errors that
   surface in the artifact toast and in the chat tool-result message.
5. The toast contract is a single `CustomEvent` with a discriminated
   `detail` (`start | success | error`). The component dedupes by
   `generationId` so the success/error replaces the matching start
   toast in place and keeps the stack tidy. The auto-dismiss timer is
   a plain `setTimeout` per terminal toast.
6. Lint fixes: line 778 used to `let answer = ''` and then assign in
   both branches — TS already enforces definite assignment from
   if/else, so the initial `''` was dead. Line 1699 deferred to a
   microtask and added a cleanup; the existing
   `eslint-disable-next-line react-hooks/exhaustive-deps` is preserved
   because `runSearch` legitimately should not be in the dep list.

Files touched:
- `src/types/index.ts` — `CanvasNodeKind` adds `'artifact'`.
- `src/store/index.ts` — `artifactUsage` ring buffer +
  `recordArtifactUsage`.
- `src/services/artifacts/types.ts` — `ProviderUsage`,
  `ArtifactUsageRecord`.
- `src/services/artifacts/ArtifactService.ts` — kind selection,
  usage recording, progress event emission.
- `src/services/artifacts/index.ts` — export new types.
- `src/services/artifacts/providers/ClaudeCodeExecutionArtifactProvider.ts`,
  `OpenAICodeInterpreterArtifactProvider.ts` — parse usage tokens.
- `src/services/artifacts/providers/OpenAIAudioArtifactProvider.ts` —
  `KNOWN_VOICES`, character-count usage.
- `src/services/artifacts/providers/OpenAIVideoArtifactProvider.ts` —
  `KNOWN_MODELS`, `KNOWN_SIZES`, seconds-validation, seconds usage.
- `src/services/markdown/MarkdownRenderer.tsx` — `onSaveCodeBlock`
  prop + `pre` override.
- `src/features/chat/MessageList.tsx` — pass `onSaveCodeBlock` for
  assistant messages, import `saveBlockAsArtifact`.
- `src/features/chat/ChatPanel.tsx` — mount `ArtifactProgressToast`.
- `src/features/chat/ArtifactProgressToast.tsx` (new).
- `src/features/canvas/ArtifactNode.tsx` (new).
- `src/features/canvas/CanvasPanel.tsx` — register new node type +
  dispatch + lint fixes at lines 778 / 1699.
- `src/components/SettingsModal/SettingsModal.tsx` — Usage tab gains
  `ArtifactUsageSection`.
- `src/App.css` — styles for artifact card / node / per-block save /
  progress toast.

Limitations:
- Artifact usage is in-memory only; an app restart clears the table.
  Persistence is the next obvious step but requires a new JSON file
  under app-data and persistence wiring.
- The voice / size allowlists are static. When OpenAI ships new voices
  or sizes the user has to update the constants. Acceptable trade-off
  given OpenAI's deprecation timeline for Sora.
- The progress toast is anchored bottom-right of the chat panel only;
  if the chat panel is hidden the toast is not visible. A global
  toast layer is a separate refactor.
- Cost USD estimation for artifact calls is not yet computed — only
  raw token / character counts. A future pass can multiply against
  the existing `providers.ts` rate table.

## 2026-04-28 21:00 — Artifact Generation Pipeline

Agent:
- Claude

Summary:
- Replaced the single-shot `create_file` LLM tool with a typed artifact
  pipeline. Text, document, audio, and (flagged) video outputs each have
  their own tool and provider adapter. Binary formats no longer ride
  through `z.string()`.
- Added `services/artifacts/` with `ArtifactService` orchestrating four
  providers: `ClaudeCodeExecutionArtifactProvider`,
  `OpenAICodeInterpreterArtifactProvider`,
  `OpenAIAudioArtifactProvider`, `OpenAIVideoArtifactProvider`.
- Claude code execution generates `.docx` / `.pptx` / `.xlsx` / `.pdf`
  via Anthropic's Python sandbox; bytes round-trip through the Files
  API (`anthropic-beta: code-execution-2025-08-25,files-api-2025-04-14`)
  and land in `attachments/YYYY-MM/`. OpenAI code interpreter is the
  optional secondary path for users who prefer GPT.
- OpenAI TTS (`audio/speech`, model `gpt-4o-mini-tts`) produces `.mp3`
  audio; chat renders an inline `<audio controls>` and an
  "AI-generated audio" disclosure label.
- Video generation is implemented behind `settings.artifacts.videoEnabled`
  with a comment block flagging Sora 2's 2026 deprecation. Off by
  default; the model only sees the tool when the flag is on.
- New artifact UI: assistant messages render artifact cards (filename,
  size, provider badge, Open / Reveal in Finder / Add-to-canvas).
  Fenced code blocks gain a hover "Save as file" action.
- Canvas grew an `ArtifactNode` for non-image, non-pdf attachments
  (icons by extension, double-click opens via the OS).
- Markdown artifacts mirror to `<vault>/Artifacts/YYYY-MM/<file>.md`
  when `mirrorTextToKnowledgeBase` is on. Binary artifacts get a
  Markdown sidecar in the same folder; the binary stays under
  `attachments/`.
- System prompt picked up a short artifact-tool policy block; it tells
  the model to call the artifact tools instead of returning inline
  content when the user asks for a file/document/audio/video.
- Settings: added document provider preference, TTS voice + format,
  KB-mirror toggle, video-flag toggle.

Approach:
1. Wrote specs 17–20 covering the pipeline, Claude generation, OpenAI
   audio/video, and the UI surface.
2. `services/artifacts/` is **not** in the Tauri import allowlist; it
   delegates binary writes to `services/attachments/` (already
   binary-safe via `writeFile(Uint8Array)`) and Markdown writes to
   `services/storage/MarkdownFileService`. Provider adapters call
   Anthropic / OpenAI HTTPS APIs directly via `fetch`, with keys read
   through `services/secrets/`. The Tauri webview's
   `anthropic-dangerous-direct-browser-access: true` header satisfies
   Anthropic's browser-direct check.
3. Refactored `services/llm/tools.ts` to a registry. Tool `execute`
   functions are thin shims over `ArtifactService.create()`. Document,
   audio, and video tools are conditionally registered based on which
   keys are configured; text is always present.
4. Pipe-through error handling: a provider failure returns
   `{ ok: false, error }` to the model, which lets it explain the
   failure to the user without crashing the chat stream.
5. Filename hygiene reuses `services/export/filenames.ts:slugify` and
   adds `normalizeFilename(raw, expectedExt)`. No path-separator or
   `..` segment can survive into disk paths.
6. The system prompt in `useChatStream.ts` gained an artifact-tool
   policy block; mode prompts (search / deep-search) are unchanged.

Files touched:
- `docs/specs/17-artifact-generation-pipeline.md` (new)
- `docs/specs/18-claude-document-generation.md` (new)
- `docs/specs/19-openai-audio-video-generation.md` (new)
- `docs/specs/20-artifact-chat-canvas-ui.md` (new)
- `src/services/artifacts/types.ts` (new)
- `src/services/artifacts/filenames.ts` (new)
- `src/services/artifacts/knowledgeBaseMirror.ts` (new)
- `src/services/artifacts/ArtifactService.ts` (new)
- `src/services/artifacts/index.ts` (new)
- `src/services/artifacts/providers/ClaudeCodeExecutionArtifactProvider.ts` (new)
- `src/services/artifacts/providers/OpenAICodeInterpreterArtifactProvider.ts` (new)
- `src/services/artifacts/providers/OpenAIAudioArtifactProvider.ts` (new)
- `src/services/artifacts/providers/OpenAIVideoArtifactProvider.ts` (new)
- `src/services/llm/tools.ts` (rewrite)
- `src/types/index.ts` (add `Settings.artifacts`, `ArtifactSettings`)
- `src/store/index.ts` (add `setArtifactSettings`)
- `src/features/chat/useChatStream.ts` (system-prompt policy)
- `src/features/chat/MessageList.tsx` (save-fenced-block action)
- `src/features/chat/ArtifactCard.tsx` (new)
- `src/features/canvas/ArtifactNode.tsx` (new)
- `src/features/canvas/CanvasPanel.tsx` (register new node kind)
- `src/components/SettingsModal/SettingsModal.tsx` (artifact controls)

Limitations:
- TTS voices and Sora sizes are free-form text; we do not validate
  against the provider's allowed list.
- No automatic thumbnail generation for video artifacts.
- Cost reporting for code-execution / TTS / video tokens is not yet
  surfaced in the Usage tab.
- Claude code execution falls back to `claude-sonnet-4-5` when the
  user's `defaultModel` is non-Anthropic; the UX could be clearer
  about the temporary model swap.

## 2026-04-28 19:30 — Editor Phase 2: Live Preview Folding, Side Panel, Drop, Properties, Slash, Anchors, Re-Import, Plugin Stub

Agent:
- Claude

Summary:
- Live Preview now actually folds the markup. A new `livePreviewMarkerFold`
  CodeMirror plugin walks the markdown syntax tree and replaces
  `HeaderMark`, `EmphasisMark`, `StrongMark`, `StrikethroughMark`,
  `LinkMark`, and `URL` ranges with zero-width decorations whenever the
  cursor is not on the same line. Source mode disables the plugin via
  the same enable-lambda, so toggling modes does not rebuild the editor.
- Drag-and-drop, paste, and image-paste of files into the editor go
  through `services/attachments`. Images insert as `![[filename]]`,
  other files as `[[filename]]`. A placeholder is shown while ingest is
  in flight and replaced when the bytes settle.
- Side panel attached to the editor: Outline (live heading list), Backlinks
  (KB-wide grep for `[[<stem>]]`), Tags (vault aggregation, 30s cache).
  Collapses to a 24px ☰ stub. Outline clicks scroll the editor; backlink
  clicks open the target file at the matching line; tag chips show
  counts but are visual-only in Phase 2.
- Heading and block-id anchors land in the wikilink resolver:
  `[[Note#Heading]]` and `[[Note#^block-id]]` parse, decorate, and route
  through `mc:open-markdown-file` with an `anchor` payload.
  `MarkdownDocumentEditor` listens for the event and either jumps within
  the open file or scrolls after the new file mounts.
- Frontmatter Properties UI sits above the editor when frontmatter
  exists. Scalar keys are typed inputs (string/number/boolean), arrays
  become comma-separated text, anything else stays read-only JSON. The
  component re-emits the full document via `gray-matter.stringify` so
  the existing save path is unchanged.
- Slash command palette inside the editor — typing `/` at line start
  opens an autocomplete with snippets (Heading 1–3, list / numbered list
  / task / quote / code block / table / callouts / wikilink scaffold)
  and dispatchers (Save / Close / Toggle Reading / Toggle Source). The
  palette is a fixed registry; future plugin commands hang off the new
  plugin API.
- Manual mirror re-import. A context-menu item "Re-import to chat
  thread…" and an `editor.reimport` command parse the live Markdown
  back into messages and atomically replace the chat thread's messages.
  The pass refuses on streaming chats, foreign files, or missing
  conversation IDs. **This is not automatic two-way sync** — the mirror
  banner still warns; the action is opt-in per save.
- Editor plugin API stub (`services/editor-plugins/`). In-process
  registry only — no remote loading, no sandbox. CodeMirror extensions
  registered through `registerEditorPlugin` are added to subsequently
  mounted editor instances; `onload` / `onunload` fire on mount /
  unmount. First-party features that want to live behind the plugin
  contract have somewhere to go now; the sandboxed runtime stays a
  future project.

Approach:
1. The new extensions live under
   `src/features/knowledge/editor/extensions/` and are composed into
   `MarkdownEditorView.tsx` after the existing wikilink + smart-wrap
   extensions. The `livePreviewMarkerFold` plugin reads `modeRef.current`
   on every update so mode swaps are cheap. `attachmentDrop` uses the
   existing `services/attachments` so we don't duplicate the chat-panel
   ingest path.
2. The side panel, properties UI, and re-import service are pure React /
   TypeScript modules so they pull no new dependencies. Backlink scans
   read every KB file once per request; that is fine at hundreds of
   notes (incremental indexing is on the deferred list).
3. Anchor parsing happens in `parseWikilinkTarget` so the source-click
   handler and the reading-mode `a` override share one definition. The
   editor scroll for an in-place anchor reuses
   `editorRef.jumpToLine(line)` — same primitive as the Outline tab.
4. The plugin API is a 100-line module with no DI framework. It exposes
   `pluginExtensions()` and `pluginCommands()` getters so future
   integrations don't have to subscribe; if they want reactive updates
   `subscribeEditorPlugins(cb)` is available.

Files touched:
- `src/features/knowledge/editor/extensions/livePreviewDecorations.ts` (new)
- `src/features/knowledge/editor/extensions/attachmentDrop.ts` (new)
- `src/features/knowledge/editor/extensions/slashCommands.ts` (new)
- `src/features/knowledge/editor/extensions/wikilink.ts` — adds heading /
  block anchor parsing + `resolveKbWikilink` / `resolveKbWikilinkAsync`.
- `src/features/knowledge/editor/sidePanel.ts` (new)
- `src/features/knowledge/editor/tagIndex.ts` (new)
- `src/features/knowledge/editor/EditorSidePanel.tsx` (new)
- `src/features/knowledge/editor/PropertiesEditor.tsx` (new)
- `src/features/knowledge/editor/MarkdownEditorView.tsx` — wires the
  new extensions, plugin hooks, and `jumpToLine` handle method.
- `src/features/knowledge/MarkdownDocumentEditor.tsx` — composes side
  panel + properties, anchor scroll listener, re-import command, toast.
- `src/services/editor-plugins/index.ts` (new)
- `src/services/knowledge/conversationMarkdownReimport.ts` (new)
- `src/services/commands/useCommands.ts` — adds `editor.reimport`.
- `src/App.css` — split layout, side panel, properties, toasts.
- `docs/specs/24-editor-live-preview-and-anchors.md` (new)
- `docs/specs/25-editor-side-panel.md` (new)
- `docs/specs/26-editor-attachments-properties-slash.md` (new)
- `docs/specs/27-editor-plugin-api-stub.md` (new)
- `docs/specs/28-mirror-manual-reimport.md` (new)
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- In Live Preview, `**bold**`, `# Heading`, `[label](url)`, etc. lose
  their markup characters when the caret is on a different line, and
  reveal them when you click back into the line.
- Cmd-clicking `[[Some Note#Heading X]]` opens that note and scrolls to
  the heading. `[[Note#^block-id]]` does the same for block IDs.
- Dropping an image onto the editor inserts `![[…]]` and copies the
  bytes into `attachments/`.
- The editor surface gains a 240px right-side panel with Outline /
  Backlinks / Tags. Collapse with the × button; expand with the ☰ stub.
- Files with YAML frontmatter show a folded Properties panel at the
  top; expanding gives typed editors per scalar.
- Right-clicking a mirrored file now offers "Re-import to chat
  thread…". The command palette has the same action.

Limitations:
- Live Preview folds markup but does not render it (no inline image
  preview, no fenced-code rendering inside the editor — those still
  belong to Reading mode).
- Backlink scans are O(N) per request; the deferred TODO is an
  incremental index.
- Tag chips in the side panel are display-only — clicking them does not
  filter the file tree yet.
- Plugin API loads no third-party code; a real sandbox is its own
  project.
- Re-import is not gated behind a confirm dialog in Phase 2; users are
  expected to verify the diff before saving.

## 2026-04-28 18:00 — Obsidian-like Knowledge Base Editor

Agent:
- Claude

Summary:
- Replaced the Knowledge Base `<textarea>` with a CodeMirror 6 surface
  inside a thin React shell. Markdown syntax highlighting, line wrapping,
  history, search, autocomplete and a real fold gutter are now part of
  the editor.
- Three modes: Live Preview (CM6 + comfortable serif typography), Source
  (CM6 + monospace), Reading (existing `react-markdown` stack with a
  KB-aware `[[link]]` resolver). The current mode persists in
  `Settings.editorMode`; default is `live-preview`.
- Smart selection wrapping for `*`, `_`, `` ` ``, `=`, `"`, `'`, `(`,
  `[`, `{`. `Mod-B`, `Mod-I`, `Mod-E`, `Mod-Shift-H` toggle bold,
  italic, code, and highlight. `Mod-Shift-X` toggles a Markdown task
  checkbox on the active line.
- Wikilink autocomplete: typing `[[` opens a dropdown sourced from the
  Knowledge Base file tree. Cmd-clicking a `[[Note]]` token in source
  resolves and opens the file; an unresolved link offers to create the
  note (`mc:create-kb-note` event).
- Reading mode renders `[[Note Title]]` as clickable KB links via a new
  `mc:kb-link/<encoded>` URL scheme. Existing `[[node-<id>]]` canvas
  references keep their previous `MarkdownRenderer` behaviour.
- New right-click context menu inside the editor: Save, Close Editor /
  Return to Canvas, Reveal in Finder, Copy Obsidian Link, Copy Markdown
  Path, Open in Canvas, Toggle Reading View, Toggle Source Mode, plus
  Ask About Selection / Search Selection when a selection exists.
- Closing with unsaved changes opens a Save / Discard / Cancel dialog;
  closing returns to the canvas because `App.tsx` already restores the
  canvas pane when `activeMarkdownPath` is null.
- Command palette gained an `Editor` section: Save, Close, Toggle Live /
  Source / Reading, Open in Canvas, Insert Wikilink. All gated to when
  the editor is mounted via a single-slot `editorRegistry`.

Approach:
1. Added CodeMirror 6 + `@uiw/react-codemirror` and `@lezer/highlight`.
   `@uiw/react-codemirror` is bundled as part of the dependency set even
   though we ended up using the lower-level `EditorView` directly — the
   package keeps the door open to `useCodeMirror` later without another
   install.
2. Built four extensions under
   `src/features/knowledge/editor/extensions/`:
   - `smartWrap.ts` — `EditorView.inputHandler` that wraps non-empty
     selections, plus a small set of `Mod-*` keymap commands and a task
     checkbox toggle.
   - `wikilink.ts` — autocomplete source backed by a cached KB file
     index (refreshed on `mc:knowledge-tree-refresh`), a `ViewPlugin`
     that decorates `[[…]]` ranges, and a Cmd-click handler that opens
     resolved targets or fires `mc:create-kb-note` for unresolved ones.
   - `frontmatterFold.ts` — fold service that lets the leading
     `---\n…\n---` block collapse via the standard fold gutter.
   - `theme.ts` — Live Preview / Source themes hooked to the app's CSS
     variables, plus a Markdown highlight style.
3. `MarkdownEditorView.tsx` is the React wrapper. It owns the long-lived
   `EditorView`, swaps the theme via a `Compartment` when the mode
   changes, exposes an imperative handle, and registers itself in
   `editorRegistry` so the command palette can reach it.
4. `KbReadingView.tsx` reuses `react-markdown` + the existing preprocess
   pipeline, but its own `a` override resolves `mc:kb-link/<encoded>`
   targets through `resolveKbWikilinkTargetAsync` rather than against
   canvas nodes.
5. `MarkdownDocumentEditor.tsx` lost the textarea entirely and now
   composes the new editor view, the reading view, the mode switcher,
   the context menu, and the close-confirmation dialog. The save / dirty
   / canvas-node-propagation contract from before is preserved unchanged.
6. `useCommands.ts` got a new `Editor` section. Commands dispatch
   `mc:editor-save`, `mc:editor-close`, and `mc:editor-toggle-mode`
   events that `MarkdownDocumentEditor` listens for — keeping editor
   state inside the editor and avoiding cross-module state coupling.

Files touched:
- `src/features/knowledge/editor/MarkdownEditorView.tsx` (new)
- `src/features/knowledge/editor/KbReadingView.tsx` (new)
- `src/features/knowledge/editor/EditorContextMenu.tsx` (new)
- `src/features/knowledge/editor/ConfirmCloseDialog.tsx` (new)
- `src/features/knowledge/editor/editorRegistry.ts` (new)
- `src/features/knowledge/editor/extensions/smartWrap.ts` (new)
- `src/features/knowledge/editor/extensions/wikilink.ts` (new)
- `src/features/knowledge/editor/extensions/frontmatterFold.ts` (new)
- `src/features/knowledge/editor/extensions/theme.ts` (new)
- `src/features/knowledge/MarkdownDocumentEditor.tsx` (rewrite)
- `src/services/commands/useCommands.ts` (Editor section)
- `src/services/commands/CommandRegistry.ts` (`Editor` section type)
- `src/store/index.ts` (`setEditorMode`)
- `src/types/index.ts` (`EditorMode`, `Settings.editorMode`)
- `src/App.css` (editor surface, mode switcher, context menu, confirm
  dialog)
- `package.json` / `pnpm-lock.yaml` — adds `@uiw/react-codemirror`,
  `@codemirror/*`, `@lezer/highlight`
- `docs/specs/21-obsidian-like-markdown-editor.md` (new)
- `docs/specs/22-editor-wikilinks-autocomplete.md` (new)
- `docs/specs/23-editor-context-menu-and-canvas-return.md` (new)

Behaviour changes:
- Opening any Markdown file from the Knowledge Base now lands you in a
  CM6 editor with syntax highlighting and Obsidian-feel chrome instead
  of a flat textarea.
- Right-clicking the editor opens our menu, not the browser default.
- Closing the editor with the X button, the menu item, or the command
  returns to the canvas; if there are unsaved edits a dialog asks Save
  / Discard / Cancel.
- Cmd/Ctrl+F now opens the editor's local search panel without
  triggering the global search palette.
- Typing `[[` opens an autocomplete with KB note suggestions; selecting
  one inserts `[[Note]]`.
- In Reading mode, `[[Note Title]]` is a clickable link that opens the
  file inside the same editor pane.

Limitations / Phase-1 scope:
- Live Preview is "syntax-styled source" — Obsidian's "fold the markup
  when the cursor leaves the line" trick is not implemented yet.
- No drag-and-drop attachments into the editor.
- No backlinks pane, outline, or graph view.
- Tag autocomplete only sees document-local + canvas-node tags, not a
  globally aggregated tag index.
- Two-way Markdown → chat sync remains future work; the mirror banner
  still warns the user.

## 2026-04-28 16:00 — Artifact Generation Pipeline

Agent:
- Claude

Summary:
- Replaced the `create_file` LLM tool with a real artifact pipeline. The
  model now has typed tools for text, documents, audio, and (flagged)
  video. Binary formats no longer travel through `z.string()`.
- Added `services/artifacts/` with `ArtifactService` and four provider
  adapters: `ClaudeCodeExecutionArtifactProvider`,
  `OpenAICodeInterpreterArtifactProvider`,
  `OpenAIAudioArtifactProvider`, `OpenAIVideoArtifactProvider`.
- Claude code execution generates `.docx` / `.pptx` / `.xlsx` / `.pdf`
  via Anthropic's Python sandbox; bytes come back through the Files API
  and land in `attachments/YYYY-MM/`. OpenAI code interpreter is the
  optional secondary path.
- OpenAI TTS produces `.mp3` audio via `audio/speech`. The chat card
  renders an inline `<audio controls>` element.
- Video generation is implemented behind a feature flag and clearly
  marked deprecating 2026.
- New artifact UI: assistant messages render artifact cards (filename,
  size, provider, Open / Reveal / Add-to-canvas). Fenced code blocks in
  assistant messages now have a "Save as file" hover action.
- Canvas gained a generic `ArtifactNode` for non-image, non-pdf
  attachments.
- Markdown artifacts mirror to `<vault>/Artifacts/YYYY-MM/<file>.md`
  when `mirrorTextToKnowledgeBase` is on. Binary artifacts get a
  Markdown sidecar in the same folder; the binary stays under
  `attachments/`.
- System prompt updated to instruct the model to prefer artifact tools
  over inline content when the user asks for a document, audio, or
  video.
- Settings: added document provider preference, TTS voice + format,
  KB-mirror toggle, video-flag toggle.

Approach:
1. Wrote specs 17–20 covering the pipeline, Claude generation, OpenAI
   audio/video, and the UI surface.
2. Added `services/artifacts/` outside the Tauri import allowlist;
   binary writes delegate to `services/attachments/`, KB writes to
   `services/storage/MarkdownFileService`. Provider adapters call
   Anthropic / OpenAI HTTPS APIs directly via `fetch` with keys from
   `services/secrets/`.
3. Refactored `services/llm/tools.ts` so the AI SDK toolset is built
   from a small registry — `create_text_artifact` is always present;
   document, audio, video tools are added when the relevant API key
   is configured. Tool `execute` functions are thin shims over
   `ArtifactService`.
4. The system prompt in `useChatStream.ts` gained a short artifact-tool
   policy block. The mode prompts (search / deep-search) are
   unchanged.
5. Added `ArtifactCard.tsx` (chat) and `ArtifactNode.tsx` (canvas);
   wired into `MessageList` and `CanvasPanel` respectively.
6. Extended `Settings` with an `artifacts` block and a setter; surfaced
   the controls in `SettingsModal` under the existing Vault & data tab.

Files touched:
- `docs/specs/17-artifact-generation-pipeline.md` (new)
- `docs/specs/18-claude-document-generation.md` (new)
- `docs/specs/19-openai-audio-video-generation.md` (new)
- `docs/specs/20-artifact-chat-canvas-ui.md` (new)
- `src/services/artifacts/*` (new)
- `src/services/llm/tools.ts` (rewrite)
- `src/types/index.ts` (add `Settings.artifacts`)
- `src/store/index.ts` (settings setter)
- `src/features/chat/useChatStream.ts` (system-prompt policy)
- `src/features/chat/MessageList.tsx` (save-fenced-block action)
- `src/features/chat/ArtifactCard.tsx` (new)
- `src/features/canvas/ArtifactNode.tsx` (new)
- `src/features/canvas/CanvasPanel.tsx` (register new node kind)
- `src/components/SettingsModal/SettingsModal.tsx` (artifact controls)

Limitations:
- No automatic thumbnail generation for video artifacts.
- TTS voices and Sora sizes are free-form text; we do not validate
  against the provider's current allowed list.
- The Claude code-execution adapter is paused on a fixed model when
  the user's `defaultModel` is non-Anthropic; a clearer UX for that
  is TODO.
- Cost reporting for code execution / TTS / video tokens is not yet
  surfaced in the Usage tab.

## 2026-04-28 13:00 — Knowledge Base Mirror Hardening

Agent:
- Claude

Summary:
- Conversation renames now actually delete the stale mirror file instead
  of leaving a tombstone redirect behind. The delete path goes through
  `markdownFiles.deletePath` and only fires when frontmatter confirms the
  file is our own mirror for the same `conversationId`.
- The `chat` badge in the Knowledge Base file tree is now confirmed by
  reading file frontmatter, not by filename alone. Candidate files
  (matching `--<id>.md` AND under `Chats/` or `Projects/`) are scanned
  asynchronously after each tree load; only files whose frontmatter
  declares `source: internal-chat` get the badge.
- Added a "Sync now" button in the Knowledge Base header. It dispatches
  `mc:knowledge-sync-request`, which the persistence layer handles by
  cancelling any pending debounce and running the mirror immediately.
  The button shows a spinner glyph while a pass is in flight.
- Added transient toasts to the Knowledge Base section. They surface
  successful sync counts, per-conversation issues, and pass-level errors
  for the previously console-only `mc:knowledge-sync` event.

Approach:
1. `conversationMarkdownMirror.ts` swapped the body-overwrite tombstone
   for `markdownFiles.deletePath`, gated on the same ownership check.
2. `MarkdownFileExplorer.tsx` runs an async confirmation pass after every
   `listTree` call: walk the tree, collect mirror-candidate files, read
   each through `markdownFiles.readFile`, and hand the paths whose
   frontmatter parses to `source: internal-chat` into a `Set` that drives
   the badge. The pass cancels cleanly via a `cancelled` flag if the
   tree refreshes mid-scan.
3. The Sync now button toggles a local `syncing` flag and dispatches the
   new `mc:knowledge-sync-request` event. `store/persistence.ts` listens
   for it, cancels its debounce timer, and calls `runMirror` directly.
4. The toast component is a single inline element timed by an effect
   (`TOAST_DURATION_MS = 4000`). `mc:knowledge-sync` event handlers map
   the result shape to `{ tone, message }` and feed the toast state.

Files changed:
- `src/services/knowledge/conversationMarkdownMirror.ts`
- `src/features/knowledge/MarkdownFileExplorer.tsx`
- `src/store/persistence.ts`
- `src/App.css`
- `docs/specs/15-knowledge-base-chat-history-mirror.md`
- `docs/specs/16-knowledge-base-search.md`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Renaming a conversation no longer leaves a "Moved" stub at the old
  path; the old file disappears and the new file appears.
- A user file that happens to match `--<id>.md` but does not declare
  `source: internal-chat` no longer renders with the `chat` badge.
- Successful syncs surface a brief "Mirrored N conversation(s)" toast;
  failures surface an inline danger toast in the Knowledge Base section
  rather than only logging to the console.

## 2026-04-28 12:00 — Knowledge Base Becomes the Visible Memory Layer

Agent:
- Claude

Summary:
- Chat history is now mirrored from JSON storage into Markdown files inside
  the Knowledge Base root. JSON (`conversations.json` / `messages.json` /
  `projects.json`) remains the runtime source of truth; the Markdown mirror
  is the user-visible knowledge layer. Sync direction in Phase 1 is one-way
  JSON → Markdown.
- Mirrored conversations land under `Chats/YYYY-MM/<slug>--<id>.md` or
  `Projects/<project-slug>/<slug>--<id>.md`. Each file carries
  `source: internal-chat`, `conversationId`, `projectId`, and `updatedAt`
  in its frontmatter.
- Mirror writes are overwrite-safe: existing files are read first, and the
  write only proceeds if the file's frontmatter declares the same
  `source: internal-chat` tag and matching `conversationId`. User-authored
  notes are never clobbered.
- The Knowledge Base file tree gained a search input that matches filenames
  + paths immediately and content (debounced 200 ms) via the existing
  `searchMarkdownFiles` service. Mirrored files render with a small `chat`
  badge so they stand out from hand-authored notes.
- The right-click menu on a Markdown file now includes Open in Canvas
  (creates a Markdown node bound to `mdPath`), Ask with this file (opens
  the AI Palette pre-loaded with the file content, truncated at 64 KB),
  and Copy Obsidian Link.
- The Markdown editor shows an inline banner when opening a mirrored chat
  file explaining that edits don't yet flow back into the original chat
  thread.

Approach:
1. New `src/services/knowledge/conversationMarkdownMirror.ts` owns the
   conversation → Markdown projection. It hashes a per-conversation
   signature (id/title/updatedAt/messageCount/tail-message tuple) and
   skips files whose signature hasn't changed since the last sync, which
   keeps the debounce loop cheap when only one conversation is dirty.
2. `MarkdownFileService` grew three helpers — `ensureFolderPath`,
   `tryReadMarkdownFile`, `writeMarkdownFileEnsuringDirs` — so the mirror
   service can stay outside the `@tauri-apps/*` ESLint allowlist while
   still creating nested folders and writing safely.
3. `store/persistence.ts` debounces mirror runs at 700 ms and re-runs
   automatically when conversations / messages / projects change. Each run
   dispatches `mc:knowledge-tree-refresh` so the explorer picks the new
   files up without manual refresh, and `mc:knowledge-sync` carries any
   error detail for surfacing.
4. `MarkdownFileExplorer` gained a search box, content-search wiring, the
   `chat` badge heuristic (`Chats/` or `Projects/` + filename ending in
   `--<id>.md`), and the new context actions. The badge is purely a
   filename pattern — it never reads frontmatter for tree rows.
5. `MarkdownDocumentEditor` reads frontmatter on the loaded content and
   renders `.knowledge-mirror-banner` when `source === 'internal-chat'`.

Files changed:
- `src/services/knowledge/conversationMarkdownMirror.ts` (new)
- `src/services/storage/MarkdownFileService.ts`
- `src/store/persistence.ts`
- `src/features/knowledge/MarkdownFileExplorer.tsx`
- `src/features/knowledge/MarkdownDocumentEditor.tsx`
- `src/App.css`
- `docs/specs/15-knowledge-base-chat-history-mirror.md` (new)
- `docs/specs/16-knowledge-base-search.md` (new)
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Opening the Knowledge Base on a project with chat history now shows the
  `Chats/` and `Projects/` folders with mirrored conversations inside.
- Sending a chat message updates `Chats/.../<file>.md` within ~700 ms.
- Renaming a conversation rewrites the new mirror file under the
  appropriate folder and leaves a tombstone redirect at the old path
  (frontmatter `moved: true`, body pointing to the new path) instead of
  deleting silently.
- The Knowledge Base search box surfaces both filename and content matches
  in a single result list, with a snippet for content matches.
- Right-clicking a mirrored or user-authored Markdown file exposes the new
  actions; existing actions (Reveal, Rename, Delete, New Note, New Folder)
  are unchanged.

## 2026-04-28 02:30 — Editing Mode Expands Node and Edges Follow

Agent:
- Codex

Summary:
- Double-clicking a Markdown node to edit now temporarily expands the node so
  the whole Markdown source is visible in a larger textarea. Saved size is
  restored on save / cancel / blur.
- Edges connected to the editing node follow the new boundary live, because
  `FlexibleEdge` reads `useInternalNode().measured` and React Flow's
  ResizeObserver picks up the new wrapper size.

Approach:
1. Editing state moved from MarkdownNode local `useState` to a global
   `ui.editingNodeId` slice in the Zustand store, with a `setEditingNode`
   action. Only one node can be in edit mode at a time.
2. While `editingNodeId === n.id`, `CanvasPanel` omits `width` and `height`
   from the rfNode so the React Flow wrapper auto-grows around the larger
   editor instead of clipping it.
3. `.markdown-node.editing` CSS gives the inner div an intrinsic size
   (`clamp(360px, 56vw, 720px)` × `clamp(280px, 64vh, 560px)`), a generous
   editor min-height, and a soft accent shadow so the expanded card reads as
   a focused state.

Files changed:
- `src/store/index.ts`
- `src/features/canvas/MarkdownNode.tsx`
- `src/features/canvas/CanvasPanel.tsx`
- `src/App.css`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Double-clicking a Markdown card on the canvas opens a noticeably larger
  edit surface. Cmd/Ctrl+Enter saves and snaps back, Escape cancels and
  snaps back, blur saves and snaps back.
- Connected edges reflow continuously while the wrapper grows / shrinks.
- The persisted node dimensions are unchanged — they come back exactly as
  they were when editing ends.

## 2026-04-28 02:00 — Flexible Edges Use React Flow Measured Sizes

Agent:
- Codex

Summary:
- Fixed the gap between flexible-edge endpoints and node boundaries. The
  previous implementation read `node.width` / `node.height` from the rfNode
  copy of the store, falling back to 280×160 for nodes without explicit
  dimensions. That diverged from the actual rendered DOM, so the boundary
  intersection landed inside or outside the node.
- The path now derives source/target rectangles from
  `useInternalNode().measured` and `internals.positionAbsolute`, which React
  Flow keeps in sync with the actual rendered DOM. Marker-anchor Y also uses
  the measured height, so highlighted-passage anchors track real text rows.

Files changed:
- `src/features/canvas/CanvasPanel.tsx`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Edges connect cleanly to the node boundary regardless of whether the node
  has explicit width/height in the store.
- Resizing a node updates connected edges in the same frame because the
  measured dimensions flow through React Flow's existing reactivity.
- During the initial render before React Flow has measured the DOM, edges
  fall back to a smooth bezier between the React-Flow-supplied
  `sourceX/sourceY/targetX/targetY` so they never disappear.

## 2026-04-28 01:30 — Drop-on-Node Connects Chat Card to Existing Node

Agent:
- Codex

Summary:
- Dropping a chat message onto an existing canvas node now creates a new
  Markdown-backed child node and an edge from the target node to the new
  node, instead of placing a standalone node at the cursor. Dropping on the
  empty pane behaves as before.
- Added drag hover feedback: while dragging a chat message, the target node
  under the cursor highlights with an accent outline and a small
  "Drop to connect" pill so the user knows the drop will create a connected
  child.

Files changed:
- `src/features/canvas/CanvasPanel.tsx`
- `src/App.css`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Drop on empty pane: standalone node at cursor (unchanged).
- Drop on existing node: new chat-derived node placed via the existing
  `findFreeNodePosition` helper (preferred slot is right of the parent;
  collision spiral falls back to other sides). An edge labeled `chat` is
  created from parent → child, and `syncConnectedMarkdownLinks` ensures both
  nodes have `.md` files and the parent's Markdown picks up a managed
  wikilink under `## Canvas Links`.
- Cross-window chat drag and the local chat drag both branch into the
  drop-on-node path when the drop coordinate hits a `.react-flow__node`.
- File drops still route through `ingestDroppedFiles` and ignore the
  drop-target node (file-on-node attachment is out of scope here).

## 2026-04-28 01:00 — Canvas Panel Right-Click Show/Hide Menu

Agent:
- Codex

Summary:
- Added a panel-level right-click menu to the canvas that mirrors the chat
  panel's context menu (spec 05). Right-clicking empty canvas previously did
  nothing when there was no selection; it now opens a macOS-style menu with
  Show/Hide Canvas, Show/Hide Chat, Reset View, Fit Selection / Fit All, and
  Select / Hand tool toggles.
- Extracted shared `Item` / `Separator` helpers into
  `components/ContextMenu/AppContextMenuItem.tsx` so the chat and canvas menus
  stay visually identical without duplicated code.

Files changed:
- `src/components/ContextMenu/AppContextMenuItem.tsx` (new)
- `src/components/CanvasPanel/CanvasPanelContextMenu.tsx` (new)
- `src/components/ChatPanel/ChatPanelContextMenu.tsx`
- `src/features/canvas/CanvasPanel.tsx`
- `src/App.tsx`
- `docs/specs/15-canvas-panel-context-menu.md` (new)
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Right-clicking empty canvas opens the new pane menu when nothing is
  selected. Existing right-click menus (node, multi-selection, text-in-node)
  still take precedence in their respective contexts.
- The new menu lets the user toggle canvas and chat visibility from the
  canvas surface, matching what the chat panel right-click already offers.
- Reset View resets the canvas viewport to `(0, 0, 1)` and persists the per
  conversation viewport. Fit Selection / Fit All zooms to the current
  selection or to all visible nodes.

## 2026-04-28 00:30 — Canvas Research Ask Workflow Polish

Agent:
- Codex

Summary:
- Replaced plain-text marker rendering with AST-level Markdown markers via a rehype plugin so blue selection highlights preserve headings, lists, code, and inline formatting.
- Made answer-node placement collision-aware: the new note searches outward from the preferred right-of-source slot until it finds a non-overlapping spot.
- Added marker-level anchoring for Ask edges: edges from a source node to its answer node now start at the marker's vertical position on the source side closest to the target, instead of the generic boundary midpoint.

Files changed:
- `src/services/markdown/MarkdownRenderer.tsx`
- `src/features/canvas/MarkdownNode.tsx`
- `src/features/canvas/CanvasPanel.tsx`
- `src/services/canvas/CanvasSelectionService.ts`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Marked Markdown nodes render with full Markdown formatting plus blue highlights instead of stripped plain text.
- Newly created answer nodes shift away from existing nodes so they no longer stack on top of prior answers.
- Ask edges visually emerge from the highlighted passage rather than the node's boundary midpoint.

## 2026-04-28 00:00 — Canvas-Native Research Ask Workflow

Agent:
- Codex

Summary:
- Added specs for canvas Markdown editing, selected-text Ask, flexible edges, and persistent selection markers.
- Added editable Markdown nodes with double-click edit, blur/Cmd+Enter save, and Escape cancel.
- Added selected-text context menu actions for Ask, Search, Copy, and Open Markdown.
- Added Ask about selection modal that sends selected passage plus Markdown and connected-node context through the existing LLM/chat path.
- Added generated answer nodes, Markdown file creation, chat history logging, managed Canvas Links wiki links, source-answer edges, and persistent blue selection markers.
- Added flexible rendered edge endpoints based on source/target node boundary intersection while keeping existing edge data.

Files changed:
- `src/types/index.ts`
- `src/features/canvas/CanvasPanel.tsx`
- `src/features/canvas/MarkdownNode.tsx`
- `src/App.css`
- `docs/specs/11-canvas-markdown-editing.md`
- `docs/specs/12-canvas-text-selection-ask.md`
- `docs/specs/13-canvas-flexible-edges.md`
- `docs/specs/14-canvas-selection-markers.md`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Markdown nodes can be edited directly on canvas and saved back to their canonical `.md` file.
- Asking about selected node text creates an answer note near the source node, links it in chat history and Markdown storage, and connects it with an edge.
- Asked passages render as blue markers; clicking a marker selects and focuses the answer node.
- Edge rendering now uses computed boundary endpoints so moved nodes reconnect more naturally.

Remaining TODOs:
- Markdown preview with markers currently falls back to marked plain text for marked nodes; richer Markdown AST-level marker rendering should replace this.
- Ask-generated answer nodes use a simple right-side placement heuristic; collision-aware placement is still future work.
- Marker-level edge anchors are not implemented yet; Ask edges connect source node to answer node using dynamic node-boundary endpoints.

## 2026-04-28 00:00 — Canvas Select and Hand Tools

Agent:
- Codex

Summary:
- Added explicit canvas tool state: `select` and `hand`.
- Added command palette commands and shortcuts for Select Tool (`V`) and Hand Tool (`H`).
- Added a canvas tool switcher overlay.

Files changed:
- `src/store/index.ts`
- `src/services/commands/useCommands.ts`
- `src/features/canvas/CanvasPanel.tsx`
- `src/App.css`
- `README.md`
- `docs/specs/10-canvas-tool-modes.md`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Select Tool keeps the existing object manipulation model: node dragging, edge/card interaction, and marquee selection.
- Hand Tool disables node/object dragging and drags the viewport camera instead, including when the drag starts over a node.

## 2026-04-28 00:00 — Reveal in Finder and Two-State Pop-Out Panels

Agent:
- Codex

Summary:
- Added safe `Reveal in Finder` support for the local Markdown knowledge-base tree.
- Added a visible reveal button to the Markdown tree header.
- Simplified pop-out panel state to two persistent states: `shown` and `hidden`.
- Kept temporary pop-outs derived from hover/focus state instead of storing temporary visibility as persistent state.
- Routed menu/palette panel actions through `shown` and `hidden`.

Files changed:
- `src-tauri/src/lib.rs`
- `src/services/storage/MarkdownFileService.ts`
- `src/features/knowledge/MarkdownFileExplorer.tsx`
- `src/App.tsx`
- `src/components/RightPane/RightPane.tsx`
- `src/components/ChatPanel/ChatPanelContextMenu.tsx`
- `src/components/Sidebar/Sidebar.tsx`
- `src/services/commands/useMenu.ts`
- `src/services/commands/useCommands.ts`
- `src/services/menu/index.ts`
- `docs/specs/01-panel-collapse-and-auto-hide.md`
- `docs/specs/04-window-menu-and-command-palette.md`
- `docs/specs/07-local-markdown-knowledge-base.md`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- File/folder/root reveal is handled by a Rust command that validates paths against the selected Markdown root.
- Markdown tree context menus expose `Reveal in Finder` for files/folders and `Reveal Root in Finder` for the root menu.
- Markdown tree header has a small reveal button that reveals the selected file/folder or root.
- Chat, canvas, and sidebar panels now use only `shown` / `hidden` persistent state.
- Hidden panels temporarily pop out from edge hover and remain while hovered or focused.
- `chatTabsAutoHide` remains independent from whole-panel visibility.

Specs updated:
- `docs/specs/01-panel-collapse-and-auto-hide.md`
- `docs/specs/04-window-menu-and-command-palette.md`
- `docs/specs/07-local-markdown-knowledge-base.md`

Known issues:
- Edge pop-out timing is hover/focus based, not animated state-machine based.

Remaining TODOs:
- Add a toast system so reveal errors can appear as non-inline notifications instead of only the tree error area.

## 2026-04-28 00:00 — Panel Show/Hide Naming Cleanup

Agent:
- Codex

Summary:
- Removed legacy compatibility menu aliases from React, command palette, menu ID typing, and Rust native menu wiring.
- Standardized panel naming on `shown` / `hidden` persistent state and Show/Hide/Toggle actions.
- Renamed temporary overlay CSS and React props to pop-out terminology.

Files changed:
- `src/App.tsx`
- `src/App.css`
- `src/components/RightPane/RightPane.tsx`
- `src/components/ChatPanel/ChatPanelContextMenu.tsx`
- `src/components/Sidebar/Sidebar.tsx`
- `src/services/commands/useMenu.ts`
- `src/services/commands/useCommands.ts`
- `src/services/menu/index.ts`
- `src-tauri/src/lib.rs`
- `docs/specs/00-window-layout-principle.md`
- `docs/specs/01-panel-collapse-and-auto-hide.md`
- `docs/specs/02-detached-windows.md`
- `docs/specs/03-chat-canvas-boundary-drag.md`
- `docs/specs/04-window-menu-and-command-palette.md`
- `docs/changes/CHANGELOG.md`

Behaviour changes:
- Native Window menu now exposes only Show/Hide actions for Chat, Canvas, and Sidebar, plus window creation and tab auto-hide actions.
- Native menu panel IDs are only `view:show-*` / `view:hide-*`; toggle actions remain command-palette actions only.
- Command palette now exposes Show/Hide/Toggle actions for Chat, Canvas, and Sidebar.
- Context menus for chat and sidebar no longer expose duplicate whole-panel persistence actions.
- Native menu checkmarks are based only on `chatPanelState`, `canvasPanelState`, and `sidebarPanelState`.

Specs updated:
- `docs/specs/00-window-layout-principle.md`
- `docs/specs/01-panel-collapse-and-auto-hide.md`
- `docs/specs/02-detached-windows.md`
- `docs/specs/03-chat-canvas-boundary-drag.md`
- `docs/specs/04-window-menu-and-command-palette.md`

Known issues:
- No new known issue.

Remaining TODOs:
- Add focused visual polish to temporary pop-out entry/exit if the current CSS animation feels abrupt in Tauri.
