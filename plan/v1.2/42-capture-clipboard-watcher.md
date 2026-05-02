# 42 — Clipboard watcher / Inbox

**Goal:** when the user copies an AI reply (anywhere on the system), Hypratia notices and offers to bring it in — without forcing a paste. Builds on plan 41.

**Depends on:** plan 41. Requires a Tauri permission for clipboard reads.

## UX

1. User copies a long block of text on macOS (e.g., from chat.openai.com or claude.ai).
2. If Hypratia is running and the clipboard text passes the AI-conversation heuristic, a small toast appears in the bottom-right of the Hypratia window: **"Import this AI conversation into Hypratia?"** with **Import** and **Dismiss** buttons.
3. Import → opens Capture Preview from plan 41 with the clipboard contents preloaded.
4. Dismiss → no action; the watcher remembers a hash of this clipboard so it does not re-prompt for the same text.

## Scope

- Opt-in feature, **off by default**. Toggle in Settings → Capture → "Watch clipboard for AI conversations".
- Polling rather than OS-level monitoring (Tauri does not expose clipboard change events in a portable way). Poll once every 1.5 s while the app is focused; pause when unfocused.
- Hash-based dedup so the same clipboard never prompts twice.
- Privacy: text never leaves the device. Explicitly state this near the toggle.
- macOS-only in v1.2; Windows in v1.3.

## Implementation

- New service `src/services/capture/ClipboardWatcher.ts`:
  - `start(onSuggest: (text: string) => void): () => void` — returns stop function.
  - Uses `@tauri-apps/plugin-clipboard-manager` (already in the allow-list under `services/`).
  - Hashes via SubtleCrypto SHA-256 (truncated to 16 bytes).
- New component `src/components/CaptureToast/CaptureToast.tsx` rendered at the app root.
- Settings UI in the existing Capture panel (Settings → Workflow or a new tab).

## Acceptance

1. With the watcher on, copying a multi-turn AI reply outside Hypratia surfaces the toast within ~2 s.
2. Copying the same text twice in a row triggers the toast only once.
3. Toggling the watcher off in settings stops all polling immediately.
4. App-unfocused → polling halts; resumes on focus.
5. With the watcher off (default), no clipboard reads happen at all.

## Risks

- Clipboard polling can read sensitive content the user did not intend to share. Strong default: off, with explicit consent toggle and clear explanation.
- Polling burns battery on portables; throttle to 1.5 s and pause on blur.
- macOS may prompt for a permission on first read in newer OS versions — pre-warm the prompt during onboarding when the user enables the toggle.
