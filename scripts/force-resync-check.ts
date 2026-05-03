/**
 * Acceptance tests for the "Force re-sync now" orchestrator.
 *
 * Run with `pnpm check:force-resync`. Pure-function tests against
 * `services/storage/forceResyncCore` — the Tauri-side shim
 * (`ForceResync.ts`) is exercised by hand from inside the running app
 * since it pulls in the Zustand store and `@tauri-apps/plugin-fs`.
 *
 * Coverage:
 *   1. throws `NoVaultConfiguredError` when no vault path is set
 *   2. happy path: calls syncFn with full state slice, records
 *      timestamp, returns `{ syncedAt, summary }`
 *   3. timestamp is ISO-8601 and matches the injected clock
 *   4. summary is passed through unchanged (orchestrator never
 *      inspects it)
 *   5. `recordLastSync` is NOT called when sync throws — the user gets
 *      a real failure rather than a misleading "synced just now"
 *   6. `formatLastSync` covers every magnitude bucket + edge cases
 */

import assert from 'node:assert/strict';
import {
  formatLastSync,
  NoVaultConfiguredError,
  runForceResync,
  type ForceResyncSnapshot,
} from '../src/services/storage/forceResyncCore.ts';
import type { CanvasNode, Conversation, Edge } from '../src/types/index.ts';

let passed = 0;
function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NOW_ISO = '2026-05-03T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

function makeConversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: over.id ?? 'conv-1',
    title: over.title ?? 'Conversation',
    createdAt: over.createdAt ?? NOW_ISO,
    updatedAt: over.updatedAt ?? NOW_ISO,
    messageIds: over.messageIds ?? [],
    ...over,
  } as Conversation;
}

function makeNode(over: Partial<CanvasNode> = {}): CanvasNode {
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
    createdAt: over.createdAt ?? NOW_ISO,
    updatedAt: over.updatedAt ?? NOW_ISO,
    ...over,
  } as CanvasNode;
}

function makeEdge(over: Partial<Edge> = {}): Edge {
  return {
    id: over.id ?? 'e1',
    sourceNodeId: over.sourceNodeId ?? 'n1',
    targetNodeId: over.targetNodeId ?? 'n2',
    kind: over.kind,
    label: over.label,
    createdAt: over.createdAt ?? NOW_ISO,
  };
}

type DummySummary = {
  vaultPath: string;
  canvases: number;
  notes: number;
};

// ---------------------------------------------------------------------------
section('no vault configured → NoVaultConfiguredError');

await check('throws NoVaultConfiguredError when vaultPath is undefined', async () => {
  const snap: ForceResyncSnapshot = {
    vaultPath: undefined,
    conversations: [makeConversation()],
    nodes: [makeNode()],
    edges: [],
  };
  let calledSync = false;
  let calledRecord = false;
  await assert.rejects(
    runForceResync<DummySummary>({
      getSnapshot: () => snap,
      syncFn: async () => {
        calledSync = true;
        return { vaultPath: '', canvases: 0, notes: 0 };
      },
      recordLastSync: () => {
        calledRecord = true;
      },
    }),
    (err) => err instanceof NoVaultConfiguredError,
  );
  assert.equal(calledSync, false, 'syncFn must NOT run when no vault is set');
  assert.equal(calledRecord, false, 'recordLastSync must NOT run when no vault');
});

await check('empty-string vaultPath also throws', async () => {
  const snap: ForceResyncSnapshot = {
    vaultPath: '',
    conversations: [],
    nodes: [],
    edges: [],
  };
  await assert.rejects(
    runForceResync<DummySummary>({
      getSnapshot: () => snap,
      syncFn: async () => ({ vaultPath: '', canvases: 0, notes: 0 }),
      recordLastSync: () => {},
    }),
    NoVaultConfiguredError,
  );
});

// ---------------------------------------------------------------------------
section('happy path: sync runs, timestamp is recorded, summary is returned');

await check('passes full snapshot slice into syncFn', async () => {
  const conversations = [makeConversation({ id: 'a' }), makeConversation({ id: 'b' })];
  const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' })];
  const edges = [makeEdge({ id: 'e1' })];
  const snap: ForceResyncSnapshot = {
    vaultPath: '/Users/me/Vault',
    conversations,
    nodes,
    edges,
  };
  let received: Parameters<
    Parameters<typeof runForceResync<DummySummary>>[0]['syncFn']
  >[0] | null = null;
  await runForceResync<DummySummary>({
    getSnapshot: () => snap,
    syncFn: async (input) => {
      received = input;
      return { vaultPath: input.vaultPath, canvases: 2, notes: 3 };
    },
    recordLastSync: () => {},
    now: () => new Date(NOW_MS),
  });
  assert.ok(received, 'syncFn must be called');
  assert.equal(received!.vaultPath, '/Users/me/Vault');
  assert.equal(received!.conversations, conversations);
  assert.equal(received!.nodes, nodes);
  assert.equal(received!.edges, edges);
});

await check('records the injected clock as ISO-8601 syncedAt', async () => {
  const recorded: string[] = [];
  const result = await runForceResync<DummySummary>({
    getSnapshot: () => ({
      vaultPath: '/v',
      conversations: [],
      nodes: [],
      edges: [],
    }),
    syncFn: async () => ({ vaultPath: '/v', canvases: 0, notes: 0 }),
    recordLastSync: (iso) => recorded.push(iso),
    now: () => new Date(NOW_MS),
  });
  assert.equal(result.syncedAt, NOW_ISO);
  assert.deepEqual(recorded, [NOW_ISO]);
});

await check('returns summary unchanged (orchestrator does not inspect it)', async () => {
  const summary: DummySummary = { vaultPath: '/v', canvases: 7, notes: 19 };
  const result = await runForceResync<DummySummary>({
    getSnapshot: () => ({
      vaultPath: '/v',
      conversations: [],
      nodes: [],
      edges: [],
    }),
    syncFn: async () => summary,
    recordLastSync: () => {},
    now: () => new Date(NOW_MS),
  });
  assert.equal(result.summary, summary);
});

await check('default clock is real Date when `now` is omitted', async () => {
  const before = Date.now();
  const result = await runForceResync<DummySummary>({
    getSnapshot: () => ({
      vaultPath: '/v',
      conversations: [],
      nodes: [],
      edges: [],
    }),
    syncFn: async () => ({ vaultPath: '/v', canvases: 0, notes: 0 }),
    recordLastSync: () => {},
  });
  const after = Date.now();
  const t = Date.parse(result.syncedAt);
  assert.ok(!Number.isNaN(t), 'syncedAt must parse as ISO-8601');
  assert.ok(t >= before && t <= after, 'syncedAt must reflect real clock when no `now` injected');
});

// ---------------------------------------------------------------------------
section('failure path: sync throws → no timestamp recorded');

await check('syncFn throws → recordLastSync is NOT called', async () => {
  let recordCalls = 0;
  await assert.rejects(
    runForceResync<DummySummary>({
      getSnapshot: () => ({
        vaultPath: '/v',
        conversations: [],
        nodes: [],
        edges: [],
      }),
      syncFn: async () => {
        throw new Error('disk full');
      },
      recordLastSync: () => {
        recordCalls += 1;
      },
      now: () => new Date(NOW_MS),
    }),
    /disk full/,
  );
  assert.equal(
    recordCalls,
    0,
    'recordLastSync must NOT fire when sync throws — otherwise UI lies "synced just now"',
  );
});

// ---------------------------------------------------------------------------
section('formatLastSync covers every magnitude bucket');

await check('undefined → "never"', () => {
  assert.equal(formatLastSync(undefined, NOW_MS), 'never');
});

await check('unparseable string → "recently"', () => {
  assert.equal(formatLastSync('not-a-date', NOW_MS), 'recently');
});

await check('< 5 seconds → "just now"', () => {
  const iso = new Date(NOW_MS - 2_000).toISOString();
  assert.equal(formatLastSync(iso, NOW_MS), 'just now');
});

await check('seconds bucket', () => {
  const iso = new Date(NOW_MS - 30_000).toISOString();
  assert.equal(formatLastSync(iso, NOW_MS), '30s ago');
});

await check('minutes bucket', () => {
  const iso = new Date(NOW_MS - 5 * 60_000).toISOString();
  assert.equal(formatLastSync(iso, NOW_MS), '5 min ago');
});

await check('hours bucket', () => {
  const iso = new Date(NOW_MS - 3 * 60 * 60_000).toISOString();
  assert.equal(formatLastSync(iso, NOW_MS), '3h ago');
});

await check('days bucket', () => {
  const iso = new Date(NOW_MS - 4 * 24 * 60 * 60_000).toISOString();
  assert.equal(formatLastSync(iso, NOW_MS), '4d ago');
});

await check('future timestamps clamp to "just now" (no negative durations)', () => {
  const iso = new Date(NOW_MS + 60_000).toISOString();
  assert.equal(formatLastSync(iso, NOW_MS), 'just now');
});

console.log(`\n✓ ${passed} force-resync checks passed.\n`);
