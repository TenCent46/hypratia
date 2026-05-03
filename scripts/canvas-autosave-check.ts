/**
 * Acceptance tests for canvas-geometry autosave.
 *
 * Run with `pnpm check:canvas-autosave`. Pure-function tests against
 * `services/canvas/CanvasAutosaveCore` + the JSON Canvas serializer.
 * The Tauri-coupled runner is exercised by hand at the end of this file
 * with a fake scheduler + an in-memory writer to prove the debounce-into-
 * one-write contract end-to-end without touching the filesystem.
 */

import assert from 'node:assert/strict';
import {
  computeDirtyConversations,
  createCanvasAutosaveScheduler,
  snapshotGeometry,
} from '../src/services/canvas/CanvasAutosaveCore.ts';
import {
  CANVAS_DIR,
  NOTES_DIR,
  canvasFilenameForConversation,
  toJsonCanvas,
} from '../src/services/export/jsonCanvasFormat.ts';
import type { CanvasNode, Edge } from '../src/types/index.ts';

let passed = 0;
function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeNode(over: Partial<CanvasNode>): CanvasNode {
  return {
    id: over.id ?? 'n1',
    conversationId: over.conversationId ?? 'conv-1',
    kind: over.kind ?? 'markdown',
    title: over.title ?? 'Note',
    contentMarkdown: over.contentMarkdown ?? '',
    position: over.position ?? { x: 0, y: 0 },
    width: over.width ?? 240,
    height: over.height ?? 160,
    tags: over.tags ?? [],
    createdAt: over.createdAt ?? '2026-05-03T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-05-03T00:00:00.000Z',
  };
}
function makeEdge(over: Partial<Edge>): Edge {
  return {
    id: over.id ?? 'e1',
    sourceNodeId: over.sourceNodeId ?? 'n1',
    targetNodeId: over.targetNodeId ?? 'n2',
    kind: over.kind,
    label: over.label,
    createdAt: over.createdAt ?? '2026-05-03T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
section('moving a node updates the .canvas file');

await check('node position change marks the conversation dirty', () => {
  const a = snapshotGeometry([makeNode({ id: 'n1', position: { x: 0, y: 0 } })], []);
  const b = snapshotGeometry([makeNode({ id: 'n1', position: { x: 100, y: 50 } })], []);
  const dirty = computeDirtyConversations(a, b);
  assert.deepEqual(Array.from(dirty), ['conv-1']);
});

await check('node size change also marks dirty', () => {
  const a = snapshotGeometry(
    [makeNode({ id: 'n1', width: 240, height: 160 })],
    [],
  );
  const b = snapshotGeometry(
    [makeNode({ id: 'n1', width: 320, height: 200 })],
    [],
  );
  const dirty = computeDirtyConversations(a, b);
  assert.deepEqual(Array.from(dirty), ['conv-1']);
});

await check('content / title edits do NOT mark dirty (only geometry counts)', () => {
  const a = snapshotGeometry([makeNode({ id: 'n1', title: 'Old', contentMarkdown: 'old' })], []);
  const b = snapshotGeometry([makeNode({ id: 'n1', title: 'New', contentMarkdown: 'new' })], []);
  const dirty = computeDirtyConversations(a, b);
  assert.equal(dirty.size, 0);
});

// ---------------------------------------------------------------------------
section('add / delete updates the .canvas file');

await check('adding a node marks dirty', () => {
  const a = snapshotGeometry([], []);
  const b = snapshotGeometry([makeNode({ id: 'n1' })], []);
  assert.deepEqual(Array.from(computeDirtyConversations(a, b)), ['conv-1']);
});

await check('deleting a node marks dirty', () => {
  const a = snapshotGeometry([makeNode({ id: 'n1' })], []);
  const b = snapshotGeometry([], []);
  assert.deepEqual(Array.from(computeDirtyConversations(a, b)), ['conv-1']);
});

await check('adding an edge marks dirty', () => {
  const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' })];
  const a = snapshotGeometry(nodes, []);
  const b = snapshotGeometry(nodes, [makeEdge({ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' })]);
  assert.deepEqual(Array.from(computeDirtyConversations(a, b)), ['conv-1']);
});

await check('deleting an edge marks dirty', () => {
  const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' })];
  const a = snapshotGeometry(nodes, [makeEdge({ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' })]);
  const b = snapshotGeometry(nodes, []);
  assert.deepEqual(Array.from(computeDirtyConversations(a, b)), ['conv-1']);
});

await check('updating an edge endpoint marks dirty', () => {
  const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' }), makeNode({ id: 'n3' })];
  const a = snapshotGeometry(nodes, [makeEdge({ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' })]);
  const b = snapshotGeometry(nodes, [makeEdge({ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n3' })]);
  assert.deepEqual(Array.from(computeDirtyConversations(a, b)), ['conv-1']);
});

await check('first snapshot marks every conversation with nodes dirty', () => {
  const next = snapshotGeometry(
    [
      makeNode({ id: 'n1', conversationId: 'a' }),
      makeNode({ id: 'n2', conversationId: 'b' }),
    ],
    [],
  );
  const dirty = computeDirtyConversations(null, next);
  assert.deepEqual(Array.from(dirty).sort(), ['a', 'b']);
});

// ---------------------------------------------------------------------------
section('canvas file paths use Hypratia/Notes; no LLM-* leaks');

await check('long-body file references resolve under Hypratia/Notes', () => {
  const long = 'x'.repeat(400);
  const node = makeNode({ id: 'big', contentMarkdown: long });
  const { canvas } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const fileNode = canvas.nodes.find((n) => n.type === 'file');
  assert.ok(fileNode, 'expected a file node for long body');
  assert.equal(fileNode.type, 'file');
  assert.match((fileNode as { file: string }).file, /^Hypratia\/Notes\//);
});

await check('serialized canvas JSON contains no legacy LLM-* paths', () => {
  const node = makeNode({ id: 'big', contentMarkdown: 'y'.repeat(400) });
  const { canvas } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const json = JSON.stringify(canvas);
  assert.doesNotMatch(json, /LLM-/);
  assert.doesNotMatch(json, /default\/canvas/);
});

await check('canvas filename slugifies title and stays inside Hypratia/Canvases', () => {
  const filename = canvasFilenameForConversation('conv-1', 'Designing Hypratia');
  assert.equal(filename, 'designing-hypratia.canvas');
  assert.equal(CANVAS_DIR, 'Hypratia/Canvases');
});

// ---------------------------------------------------------------------------
section('repeated rapid moves debounce into ONE write');

await check('three notify() calls within debounce window → one writeCanvas', async () => {
  const writes: string[] = [];
  let pendingFire: (() => void) | null = null;
  const scheduler = createCanvasAutosaveScheduler({
    setTimeoutFn: (fn, _ms) => {
      pendingFire = fn;
      return 1;
    },
    clearTimeoutFn: () => {
      pendingFire = null;
    },
    writeCanvas: async (id) => {
      writes.push(id);
    },
    debounceMs: 700,
  });
  scheduler.notify('conv-1');
  scheduler.notify('conv-1');
  scheduler.notify('conv-1');
  assert.equal(writes.length, 0, 'no write before timer fires');
  assert.ok(pendingFire, 'timer fn must be armed');
  pendingFire!();
  await scheduler.__flushNow();
  assert.deepEqual(writes, ['conv-1']);
});

await check('multiple conversations dirty → each gets exactly one write', async () => {
  const writes: string[] = [];
  let pendingFire: (() => void) | null = null;
  const scheduler = createCanvasAutosaveScheduler({
    setTimeoutFn: (fn) => {
      pendingFire = fn;
      return 1;
    },
    clearTimeoutFn: () => {
      pendingFire = null;
    },
    writeCanvas: async (id) => {
      writes.push(id);
    },
  });
  scheduler.notify('a');
  scheduler.notify('b');
  scheduler.notify('a'); // duplicate
  pendingFire!();
  await scheduler.__flushNow();
  assert.deepEqual(writes.sort(), ['a', 'b']);
});

await check('dispose() drops queued state without firing', async () => {
  const writes: string[] = [];
  let pendingFire: (() => void) | null = null;
  const scheduler = createCanvasAutosaveScheduler({
    setTimeoutFn: (fn) => {
      pendingFire = fn;
      return 1;
    },
    clearTimeoutFn: () => {
      pendingFire = null;
    },
    writeCanvas: async (id) => {
      writes.push(id);
    },
  });
  scheduler.notify('conv-1');
  scheduler.dispose();
  // Even if a stale timer fires, nothing should be written.
  if (pendingFire) pendingFire();
  await scheduler.__flushNow();
  assert.deepEqual(writes, []);
});

await check('writeCanvas errors are isolated; later writes still run', async () => {
  const writes: string[] = [];
  const errors: string[] = [];
  let pendingFire: (() => void) | null = null;
  const scheduler = createCanvasAutosaveScheduler({
    setTimeoutFn: (fn) => {
      pendingFire = fn;
      return 1;
    },
    clearTimeoutFn: () => {
      pendingFire = null;
    },
    writeCanvas: async (id) => {
      if (id === 'broken') throw new Error('disk full');
      writes.push(id);
    },
    onWriteError: (id) => errors.push(id),
  });
  scheduler.notify('broken');
  scheduler.notify('ok');
  pendingFire!();
  await scheduler.__flushNow();
  assert.deepEqual(writes, ['ok']);
  assert.deepEqual(errors, ['broken']);
});

console.log(`\n✓ ${passed} canvas-autosave checks passed.\n`);
