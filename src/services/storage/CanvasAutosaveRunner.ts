/**
 * Wire-up for canvas-geometry autosave: subscribe to the Zustand store,
 * route geometry changes through the pure scheduler, and write `.canvas`
 * files atomically (`.tmp` then `rename`) into the user's vault under
 * `Hypratia/Canvases/<slug>.canvas`.
 *
 * One-way only — writes vault, never reads it back. Markdown body refresh
 * stays the job of `RefreshFromVault`. Live file watching is intentionally
 * not implemented here.
 */

import {
  exists,
  mkdir,
  rename,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useStore } from '../../store';
import {
  CANVAS_DIR,
  NOTES_DIR,
  canvasFilenameForConversation,
  toJsonCanvas,
} from '../export/jsonCanvasFormat';
import {
  computeDirtyConversations,
  createCanvasAutosaveScheduler,
  snapshotGeometry,
  type GeometryFingerprint,
} from '../canvas/CanvasAutosaveCore';

const DEBOUNCE_MS = 700;

/**
 * Start the autosave loop. Returns a stop function that disposes the
 * scheduler and unsubscribes from the store. Call once per app lifetime
 * — multiple concurrent runners would step on each other's atomic writes.
 */
export function startCanvasAutosave(): () => void {
  const scheduler = createCanvasAutosaveScheduler({
    setTimeoutFn: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeoutFn: (h) => window.clearTimeout(h as number),
    writeCanvas: writeCanvasGeometryForConversation,
    onWriteError: (id, err) => {
      console.warn('[canvas-autosave] write failed', id, err);
    },
    debounceMs: DEBOUNCE_MS,
  });

  // Establish baseline. The first store change after mount diffs against
  // *this* fingerprint, so we don't fire a "rewrite everything" pass on
  // every app launch — only when geometry actually changes. The downside
  // is that the very first run on a fresh vault won't write canvases
  // until the user touches a node; that's intentional. Manual export
  // remains for the "push everything I have right now" case.
  let prev: GeometryFingerprint = snapshotGeometry(
    useStore.getState().nodes,
    useStore.getState().edges,
  );

  // Subscribe to (nodes, edges). Reference equality is enough — Zustand
  // hands us a new array on every mutation. Body / title edits do touch
  // the array, but `computeDirtyConversations` filters to geometry-only.
  const unsubscribe = useStore.subscribe((state, prevState) => {
    if (state.nodes === prevState.nodes && state.edges === prevState.edges) {
      return;
    }
    const next = snapshotGeometry(state.nodes, state.edges);
    const dirty = computeDirtyConversations(prev, next);
    prev = next;
    if (dirty.size === 0) return;
    for (const id of dirty) scheduler.notify(id);
  });

  return () => {
    unsubscribe();
    scheduler.dispose();
  };
}

// ---------------------------------------------------------------------------
// Atomic write — the only Tauri-coupled bit
// ---------------------------------------------------------------------------

/**
 * Read the latest store state and write the `.canvas` file for the given
 * conversation. Ignored when no vault is configured — autosave is a
 * vault-relative concept by definition.
 */
async function writeCanvasGeometryForConversation(
  conversationId: string,
): Promise<void> {
  const state = useStore.getState();
  const vaultPath = state.settings.obsidianVaultPath;
  if (!vaultPath) return;
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (!conv) {
    // Conversation deleted between schedule and flush. Nothing to do —
    // we leave any prior `.canvas` file alone (deletion lives in plan
    // v1.3+, with proper undo affordances).
    return;
  }
  const nodes = state.nodes.filter((n) => n.conversationId === conversationId);
  if (nodes.length === 0) {
    // Empty canvas. We could rewrite an empty `.canvas` but it's nicer
    // to leave the previous file alone (the user might have just cleared
    // a temporary selection); explicit Sync to Vault still rewrites.
    return;
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = state.edges.filter(
    (e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId),
  );

  // Geometry-only write: the `.canvas` blob references existing
  // `Hypratia/Notes/<id>.md` sidecars but does NOT update them. Body
  // edits flow through the live-storage path (#1b live consolidation).
  const { canvas } = toJsonCanvas(nodes, edges, { notesDir: NOTES_DIR });
  const text = `${JSON.stringify(canvas, null, 2)}\n`;

  const canvasName = canvasFilenameForConversation(conv.id, conv.title);
  const canvasesDir = await join(vaultPath, ...CANVAS_DIR.split('/'));
  await ensureDir(canvasesDir);
  const targetPath = await join(canvasesDir, canvasName);
  await atomicWriteText(targetPath, text);

  // Record liveness AFTER the rename — Sync Doctor uses this to prove
  // autosave is actually flushing to disk, not just enqueuing.
  state.setLastCanvasAutosaveAt(new Date().toISOString());
}

async function ensureDir(p: string): Promise<void> {
  if (!(await exists(p))) await mkdir(p, { recursive: true });
}

/**
 * Atomic file write: stage to `<path>.tmp`, then rename into place. On
 * the rare collision (a stale `.tmp` from a crashed previous run), drop
 * the leftover before re-staging.
 */
async function atomicWriteText(absPath: string, content: string): Promise<void> {
  const tmpPath = `${absPath}.tmp`;
  if (await exists(tmpPath)) {
    try {
      await remove(tmpPath);
    } catch {
      /* best-effort — rename would fail loudly anyway */
    }
  }
  await writeTextFile(tmpPath, content);
  await rename(tmpPath, absPath);
}
