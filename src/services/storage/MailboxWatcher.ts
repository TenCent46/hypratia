/**
 * Plan 53 — Hypratia-side mailbox watcher.
 *
 * The Obsidian companion plugin writes payloads to
 * `{vault}/Hypratia/.mailbox/incoming/{nano}.json`. This watcher polls that
 * folder while the app is focused, reads each payload, deletes the file,
 * and hands the content off to the caller (typically: open Capture Preview
 * with the payload's text as input).
 *
 * Off by default. Activated explicitly from settings; pauses on window blur
 * to keep battery cost negligible.
 */

import { exists, readDir, readTextFile, remove } from '@tauri-apps/plugin-fs';

export type MailboxIncoming =
  | {
      kind: 'send-selection';
      sentAt: string;
      sourceFile: string;
      text: string;
      title?: string;
    }
  | {
      kind: 'send-file';
      sentAt: string;
      sourceFile: string;
      title: string;
      content: string;
    };

const POLL_INTERVAL_MS = 2_500;

export type MailboxWatcherHandle = {
  stop: () => void;
};

/**
 * Start watching `{vaultPath}/Hypratia/.mailbox/incoming` for incoming
 * payloads. Each payload is read, then deleted, then surfaced to `onPayload`.
 * The `enabled()` callback lets the watcher pause cheaply (e.g., when the
 * window loses focus or the user toggles the setting off).
 */
export function startMailboxWatcher(opts: {
  vaultPath: string;
  enabled: () => boolean;
  onPayload: (payload: MailboxIncoming) => void;
}): MailboxWatcherHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const dir = `${opts.vaultPath}/Hypratia/.mailbox/incoming`;

  async function tick() {
    if (stopped) return;
    if (!opts.enabled()) {
      timer = setTimeout(tick, POLL_INTERVAL_MS);
      return;
    }
    try {
      if (!(await exists(dir))) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      const entries = await readDir(dir);
      for (const entry of entries) {
        if (!entry.isFile || !entry.name.endsWith('.json')) continue;
        const path = `${dir}/${entry.name}`;
        try {
          const raw = await readTextFile(path);
          const parsed = JSON.parse(raw) as MailboxIncoming;
          if (!isValid(parsed)) {
            // Drop malformed entries so they don't block the queue.
            await remove(path);
            continue;
          }
          opts.onPayload(parsed);
          await remove(path);
        } catch (err) {
          console.warn('[mailbox] failed to handle entry', path, err);
        }
      }
    } catch (err) {
      console.warn('[mailbox] poll failed', err);
    }
    if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  // First tick after a short delay so we don't fight initial app-load fs work.
  timer = setTimeout(tick, 600);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

function isValid(p: unknown): p is MailboxIncoming {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  if (obj.kind === 'send-selection') {
    return typeof obj.text === 'string' && obj.text.length > 0;
  }
  if (obj.kind === 'send-file') {
    return typeof obj.content === 'string' && typeof obj.title === 'string';
  }
  return false;
}
