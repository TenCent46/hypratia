/**
 * Pure core for canvas-geometry autosave. Decides which conversations
 * have geometry changes worth re-emitting a `.canvas` file for, and
 * provides an injectable debounced scheduler so the runner stays thin
 * and the logic is testable without timers / Tauri.
 *
 * What counts as "geometry":
 *   - node added or removed
 *   - node's `position` / `width` / `height` changed
 *   - edge added or removed
 *   - edge's source / target / kind / label changed
 *
 * What does NOT count (so we don't waste writes during typing):
 *   - `contentMarkdown` changes
 *   - `title` changes
 *   - `tags`, `frontmatter`, sidecar fields
 *   - `selectionMarkers`, `embedding`, `themeId`, `importance`
 */

import type { CanvasNode, Edge } from '../../types';

export type NodeGeom = {
  conversationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EdgeGeom = {
  /** Conversation the edge "belongs to" — derived from its source node. */
  conversationId: string;
  source: string;
  target: string;
  kind?: string;
  label?: string;
};

export type GeometryFingerprint = {
  /** Map of node id → geometry. Includes conversationId for routing. */
  nodes: Map<string, NodeGeom>;
  /** Map of edge id → geometry. */
  edges: Map<string, EdgeGeom>;
};

/**
 * Snapshot the current geometry. Cheap O(N) over nodes + edges; no
 * defensive copies of the inputs.
 */
export function snapshotGeometry(
  nodes: readonly CanvasNode[],
  edges: readonly Edge[],
): GeometryFingerprint {
  const nodeMap = new Map<string, NodeGeom>();
  for (const n of nodes) {
    nodeMap.set(n.id, {
      conversationId: n.conversationId,
      x: n.position.x,
      y: n.position.y,
      w: n.width ?? 0,
      h: n.height ?? 0,
    });
  }
  const edgeMap = new Map<string, EdgeGeom>();
  for (const e of edges) {
    const owner = nodeMap.get(e.sourceNodeId);
    if (!owner) continue; // orphan — the source node isn't in our snapshot
    edgeMap.set(e.id, {
      conversationId: owner.conversationId,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      kind: e.kind,
      label: e.label,
    });
  }
  return { nodes: nodeMap, edges: edgeMap };
}

/**
 * Diff two snapshots and return the set of conversation ids whose canvas
 * needs a re-write. `prev === null` is treated as "this is the first
 * snapshot" — every conversation that has at least one node ends up in
 * the dirty set, so the initial flush mints fresh `.canvas` files.
 */
export function computeDirtyConversations(
  prev: GeometryFingerprint | null,
  next: GeometryFingerprint,
): Set<string> {
  const dirty = new Set<string>();
  if (!prev) {
    for (const g of next.nodes.values()) dirty.add(g.conversationId);
    for (const g of next.edges.values()) dirty.add(g.conversationId);
    return dirty;
  }
  // Removed nodes / edges → mark their old conversation dirty.
  for (const [id, g] of prev.nodes) {
    if (!next.nodes.has(id)) dirty.add(g.conversationId);
  }
  for (const [id, g] of prev.edges) {
    if (!next.edges.has(id)) dirty.add(g.conversationId);
  }
  // Added or moved/resized nodes.
  for (const [id, g] of next.nodes) {
    const before = prev.nodes.get(id);
    if (!before) {
      dirty.add(g.conversationId);
      continue;
    }
    if (
      before.conversationId !== g.conversationId ||
      before.x !== g.x ||
      before.y !== g.y ||
      before.w !== g.w ||
      before.h !== g.h
    ) {
      dirty.add(g.conversationId);
      if (before.conversationId !== g.conversationId) {
        // Node moved between conversations — both canvases need rewriting.
        dirty.add(before.conversationId);
      }
    }
  }
  // Added or modified edges.
  for (const [id, g] of next.edges) {
    const before = prev.edges.get(id);
    if (!before) {
      dirty.add(g.conversationId);
      continue;
    }
    if (
      before.source !== g.source ||
      before.target !== g.target ||
      before.kind !== g.kind ||
      before.label !== g.label ||
      before.conversationId !== g.conversationId
    ) {
      dirty.add(g.conversationId);
      if (before.conversationId !== g.conversationId) {
        dirty.add(before.conversationId);
      }
    }
  }
  return dirty;
}

// ---------------------------------------------------------------------------
// Debounced scheduler with injectable timer + writer
// ---------------------------------------------------------------------------

export type SchedulerDeps = {
  setTimeoutFn: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn: (handle: unknown) => void;
  /** Called once per dirty conversation when the debounce fires. Errors are
   *  swallowed by the scheduler so one bad write never blocks the queue. */
  writeCanvas: (conversationId: string) => Promise<void>;
  /** Called when an internal write throws — useful for telemetry. */
  onWriteError?: (conversationId: string, err: unknown) => void;
  debounceMs?: number;
};

export type CanvasAutosaveScheduler = {
  /** Mark a conversation as dirty and (re)arm the debounce timer. */
  notify(conversationId: string): void;
  /** Drop pending state and stop the timer. */
  dispose(): void;
  /** Test-only: bypass the timer and run a flush right now. */
  __flushNow(): Promise<void>;
};

/**
 * Build a scheduler with all timing / fs side effects supplied as deps.
 * The runner wires real `window.setTimeout` + a Tauri-backed writer; tests
 * supply a fake timer + an in-memory writer.
 */
export function createCanvasAutosaveScheduler(
  deps: SchedulerDeps,
): CanvasAutosaveScheduler {
  const debounce = deps.debounceMs ?? 700;
  const dirty = new Set<string>();
  let timer: unknown = null;
  let disposed = false;

  function arm() {
    if (disposed) return;
    if (timer !== null) deps.clearTimeoutFn(timer);
    timer = deps.setTimeoutFn(() => {
      timer = null;
      void flush();
    }, debounce);
  }

  async function flush() {
    if (disposed) return;
    const ids = Array.from(dirty);
    dirty.clear();
    for (const id of ids) {
      try {
        await deps.writeCanvas(id);
      } catch (err) {
        deps.onWriteError?.(id, err);
      }
    }
  }

  return {
    notify(conversationId: string) {
      if (disposed) return;
      dirty.add(conversationId);
      arm();
    },
    dispose() {
      disposed = true;
      if (timer !== null) deps.clearTimeoutFn(timer);
      timer = null;
      dirty.clear();
    },
    __flushNow: flush,
  };
}
