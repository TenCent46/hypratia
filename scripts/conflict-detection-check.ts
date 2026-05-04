/**
 * Acceptance tests for Refresh-from-Vault conflict detection.
 *
 * Run with `pnpm check:conflict-detection`. Pure-function tests
 * against:
 *
 *   - `services/sync/bodyHash.ts`           — FNV-1a + frontmatter
 *                                              stripper + body
 *                                              normalization
 *   - `services/sync/conflictClassifier.ts` — 4-way classification
 *   - `services/sync/refreshFromVaultCore`  — `planRefreshActions` +
 *                                              `applyRefreshActions`
 *   - `services/storage/forceResyncCore`    — `runForceResync` with
 *                                              `recordNodeSyncMeta`
 *
 * The Tauri shims (`RefreshFromVault.ts`, `ForceResync.ts`) just
 * funnel store + filesystem state into these pure surfaces, so
 * verifying the matrix here covers the user-facing semantics.
 *
 * Coverage maps directly to the 7 scenarios in the implementation
 * prompt:
 *   1. vault-only edit pulls successfully
 *   2. Hypratia-only edit is skipped
 *   3. both-side edit is detected as conflict
 *   4. unchanged file no-ops
 *   5. body hash ignores frontmatter changes
 *   6. successful refresh updates lastSyncedBodyHash
 *   7. Force Re-sync updates lastSyncedBodyHash
 */

import assert from 'node:assert/strict';
import {
  fnv1a,
  hashMarkdownBody,
  normalizeBody,
  stripFrontmatter,
} from '../src/services/sync/bodyHash.ts';
import {
  classifyConflict,
} from '../src/services/sync/conflictClassifier.ts';
import {
  applyRefreshActions,
  planRefreshActions,
  type RefreshScannedFile,
  type RefreshStoreNode,
} from '../src/services/sync/refreshFromVaultCore.ts';
import { runForceResync } from '../src/services/storage/forceResyncCore.ts';
import type { Conversation, CanvasNode, Edge } from '../src/types/index.ts';

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

function makeFile(over: Partial<RefreshScannedFile> & { hypratiaId: string; body: string }): RefreshScannedFile {
  return {
    path: over.path ?? `Hypratia/Notes/${over.hypratiaId}.md`,
    text: over.text ?? `---\nhypratia_id: ${over.hypratiaId}\n---\n\n${over.body}`,
    hypratiaId: over.hypratiaId,
    body: over.body,
  };
}

function makeStoreNode(over: Partial<RefreshStoreNode> & { id: string; contentMarkdown: string }): RefreshStoreNode {
  return {
    id: over.id,
    title: over.title ?? `Node ${over.id}`,
    contentMarkdown: over.contentMarkdown,
    syncMeta: over.syncMeta,
  };
}

// ---------------------------------------------------------------------------
section('bodyHash: stripFrontmatter + normalizeBody + hashMarkdownBody');

await check('stripFrontmatter removes leading YAML block', () => {
  assert.equal(
    stripFrontmatter('---\nkey: v\n---\nbody here'),
    'body here',
  );
});

await check('stripFrontmatter handles a blank line after the closing ---', () => {
  assert.equal(
    stripFrontmatter('---\nkey: v\n---\n\nbody here'),
    'body here',
  );
});

await check('stripFrontmatter is a no-op for plain markdown', () => {
  assert.equal(stripFrontmatter('plain body'), 'plain body');
});

await check('stripFrontmatter leaves malformed (unterminated) frontmatter alone', () => {
  const text = '---\nkey: v\nno closing fence';
  assert.equal(stripFrontmatter(text), text);
});

await check('normalizeBody collapses CRLF, strips leading newlines, trimEnds', () => {
  assert.equal(normalizeBody('\n\nhello\r\nworld\n  '), 'hello\nworld');
});

await check('fnv1a is deterministic and 8-hex-wide', () => {
  const h = fnv1a('hello');
  assert.equal(h, fnv1a('hello'));
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.notEqual(h, fnv1a('world'));
});

// Scenario 5: body hash ignores frontmatter changes ---------------------------
section('scenario 5 — body hash ignores frontmatter changes');

await check('changing frontmatter alone does NOT change the hash', () => {
  const a = '---\nhypratia_id: n1\n---\n\nThe body stays put.';
  const b = '---\nhypratia_id: n1\nhypratia_updated: 2026-05-03\ntags: [hypratia]\n---\n\nThe body stays put.';
  assert.equal(hashMarkdownBody(a), hashMarkdownBody(b));
});

await check('changing the body DOES change the hash', () => {
  const a = '---\nhypratia_id: n1\n---\n\nFirst body.';
  const b = '---\nhypratia_id: n1\n---\n\nSecond body.';
  assert.notEqual(hashMarkdownBody(a), hashMarkdownBody(b));
});

await check('round-trip stable: contentMarkdown vs file body after Hypratia write', () => {
  // Hypratia stores `body` in `node.contentMarkdown`. The writer
  // emits `---\n…\n---\n\nbody` (extra `\n` between fence + body).
  // The hash of the in-memory body MUST equal the hash of the
  // round-tripped file body so the very next refresh doesn't see a
  // phantom diff.
  const inMemory = 'Round-trip me.';
  const onDisk = '---\nhypratia_id: n1\n---\n\nRound-trip me.';
  assert.equal(hashMarkdownBody(inMemory), hashMarkdownBody(onDisk));
});

// ---------------------------------------------------------------------------
section('classifyConflict matrix');

await check('vault === store → unchanged (regardless of baseline)', () => {
  const h = 'aaaaaaaa';
  assert.equal(
    classifyConflict({ vaultBodyHash: h, storeBodyHash: h }),
    'unchanged',
  );
  assert.equal(
    classifyConflict({
      vaultBodyHash: h,
      storeBodyHash: h,
      lastSyncedBodyHash: 'bbbbbbbb',
    }),
    'unchanged',
  );
});

await check('vault changed, store unchanged → vault-changed-only', () => {
  assert.equal(
    classifyConflict({
      vaultBodyHash: 'NEW',
      storeBodyHash: 'OLD',
      lastSyncedBodyHash: 'OLD',
    }),
    'vault-changed-only',
  );
});

await check('vault unchanged, store changed → hypratia-changed-only', () => {
  assert.equal(
    classifyConflict({
      vaultBodyHash: 'OLD',
      storeBodyHash: 'NEW',
      lastSyncedBodyHash: 'OLD',
    }),
    'hypratia-changed-only',
  );
});

await check('both sides diverged from baseline → conflict', () => {
  assert.equal(
    classifyConflict({
      vaultBodyHash: 'V_NEW',
      storeBodyHash: 'H_NEW',
      lastSyncedBodyHash: 'OLD',
    }),
    'conflict',
  );
});

await check('no baseline + sides differ → conflict-no-baseline (safe default, but tagged distinctly so UI can prompt for Force Re-sync)', () => {
  assert.equal(
    classifyConflict({
      vaultBodyHash: 'X',
      storeBodyHash: 'Y',
    }),
    'conflict-no-baseline',
  );
});

// ---------------------------------------------------------------------------
section('planRefreshActions: scenarios 1–4');

// Scenario 1: vault-only edit pulls successfully
await check('scenario 1 — vault-only edit produces an apply action', () => {
  const baseline = hashMarkdownBody('original');
  const node = makeStoreNode({
    id: 'n1',
    contentMarkdown: 'original',
    syncMeta: { lastSyncedBodyHash: baseline, lastSyncedAt: NOW_ISO },
  });
  const file = makeFile({ hypratiaId: 'n1', body: 'edited in obsidian' });
  const plan = planRefreshActions({ files: [file], storeNodes: [node] });
  assert.equal(plan.counts.updated, 1);
  assert.equal(plan.counts.skipped, 0);
  assert.equal(plan.counts.conflicts, 0);
  const apply = plan.actions[0];
  assert.equal(apply.kind, 'apply');
  if (apply.kind === 'apply') {
    assert.equal(apply.hypratiaId, 'n1');
    assert.equal(apply.newBody, 'edited in obsidian');
    assert.equal(apply.newHash, hashMarkdownBody('edited in obsidian'));
  }
});

// Scenario 2: Hypratia-only edit is skipped
await check('scenario 2 — Hypratia-only edit skips, no apply emitted', () => {
  const baseline = hashMarkdownBody('agreed body');
  const node = makeStoreNode({
    id: 'n1',
    contentMarkdown: 'edited in hypratia',
    syncMeta: { lastSyncedBodyHash: baseline, lastSyncedAt: NOW_ISO },
  });
  const file = makeFile({ hypratiaId: 'n1', body: 'agreed body' });
  const plan = planRefreshActions({ files: [file], storeNodes: [node] });
  assert.equal(plan.counts.updated, 0);
  assert.equal(plan.counts.skipped, 1);
  assert.equal(plan.counts.conflicts, 0);
  assert.equal(plan.actions[0].kind, 'skip');
  if (plan.actions[0].kind === 'skip') {
    assert.equal(plan.actions[0].classification, 'hypratia-changed-only');
  }
});

// Scenario 3: both-side edit is detected as conflict
await check('scenario 3 — both-side edit is reported as conflict, no apply', () => {
  const baseline = hashMarkdownBody('original');
  const node = makeStoreNode({
    id: 'n1',
    title: 'Shared note',
    contentMarkdown: 'hypratia diverged',
    syncMeta: { lastSyncedBodyHash: baseline, lastSyncedAt: NOW_ISO },
  });
  const file = makeFile({
    hypratiaId: 'n1',
    body: 'obsidian also diverged',
    path: 'Hypratia/Notes/n1.md',
  });
  const plan = planRefreshActions({ files: [file], storeNodes: [node] });
  assert.equal(plan.counts.updated, 0);
  assert.equal(plan.counts.conflicts, 1);
  const action = plan.actions[0];
  assert.equal(action.kind, 'conflict');
  if (action.kind === 'conflict') {
    assert.equal(action.detail.hypratiaId, 'n1');
    assert.equal(action.detail.path, 'Hypratia/Notes/n1.md');
    assert.equal(action.detail.title, 'Shared note');
    assert.equal(action.detail.lastSyncedBodyHash, baseline);
    assert.equal(action.detail.reason, 'conflict');
    assert.equal(action.detail.vaultBodyHash, hashMarkdownBody('obsidian also diverged'));
    assert.equal(action.detail.storeBodyHash, hashMarkdownBody('hypratia diverged'));
  }
});

// Scenario 4: unchanged file no-ops
await check('scenario 4 — unchanged file emits a skip with no body change', () => {
  const baseline = hashMarkdownBody('same body');
  const node = makeStoreNode({
    id: 'n1',
    contentMarkdown: 'same body',
    syncMeta: { lastSyncedBodyHash: baseline, lastSyncedAt: NOW_ISO },
  });
  const file = makeFile({ hypratiaId: 'n1', body: 'same body' });
  const plan = planRefreshActions({ files: [file], storeNodes: [node] });
  assert.equal(plan.counts.updated, 0);
  assert.equal(plan.counts.skipped, 1);
  assert.equal(plan.counts.conflicts, 0);
  assert.equal(plan.actions[0].kind, 'skip');
  if (plan.actions[0].kind === 'skip') {
    assert.equal(plan.actions[0].classification, 'unchanged');
  }
});

await check('unmatched: no hypratia_id and unknown id are reported separately', () => {
  const file1 = {
    path: 'Hypratia/Notes/random.md',
    text: 'no fm',
    hypratiaId: null,
    body: 'no fm',
  } as RefreshScannedFile;
  const file2 = makeFile({ hypratiaId: 'ghost', body: 'orphan' });
  const plan = planRefreshActions({ files: [file1, file2], storeNodes: [] });
  assert.equal(plan.counts.unmatched, 2);
  const reasons = plan.actions
    .filter((a): a is Extract<typeof a, { kind: 'unmatched' }> => a.kind === 'unmatched')
    .map((a) => a.reason);
  assert.deepEqual(reasons.sort(), ['no-id', 'unknown-id']);
});

// ---------------------------------------------------------------------------
section('scenario 6 — successful refresh updates lastSyncedBodyHash');

await check('applyRefreshActions calls recordSyncedHash with the new vault hash', () => {
  const baseline = hashMarkdownBody('original');
  const node = makeStoreNode({
    id: 'n1',
    contentMarkdown: 'original',
    syncMeta: { lastSyncedBodyHash: baseline, lastSyncedAt: NOW_ISO },
  });
  const file = makeFile({ hypratiaId: 'n1', body: 'pulled from vault' });
  const plan = planRefreshActions({ files: [file], storeNodes: [node] });

  const updates: { id: string; body: string }[] = [];
  const stamps: { id: string; hash: string; at: string }[] = [];
  applyRefreshActions(plan.actions, {
    updateNodeBody: (id, body) => updates.push({ id, body }),
    recordSyncedHash: (id, hash, at) => stamps.push({ id, hash, at }),
    syncedAt: NOW_ISO,
  });
  assert.deepEqual(updates, [{ id: 'n1', body: 'pulled from vault' }]);
  assert.deepEqual(stamps, [
    { id: 'n1', hash: hashMarkdownBody('pulled from vault'), at: NOW_ISO },
  ]);
});

await check('skip / conflict / unmatched actions do NOT call recordSyncedHash', () => {
  const baseline = hashMarkdownBody('agreed');
  const node = makeStoreNode({
    id: 'n1',
    contentMarkdown: 'agreed',
    syncMeta: { lastSyncedBodyHash: baseline, lastSyncedAt: NOW_ISO },
  });
  // Three non-apply outcomes: unchanged (skip), conflict, unmatched.
  const unchangedFile = makeFile({ hypratiaId: 'n1', body: 'agreed' });
  const conflictNode = makeStoreNode({
    id: 'n2',
    contentMarkdown: 'h diverged',
    syncMeta: { lastSyncedBodyHash: hashMarkdownBody('orig'), lastSyncedAt: NOW_ISO },
  });
  const conflictFile = makeFile({ hypratiaId: 'n2', body: 'v diverged' });
  const ghostFile = makeFile({ hypratiaId: 'ghost', body: 'no node' });
  const plan = planRefreshActions({
    files: [unchangedFile, conflictFile, ghostFile],
    storeNodes: [node, conflictNode],
  });
  const updates: string[] = [];
  const stamps: string[] = [];
  applyRefreshActions(plan.actions, {
    updateNodeBody: (id) => updates.push(id),
    recordSyncedHash: (id) => stamps.push(id),
    syncedAt: NOW_ISO,
  });
  assert.deepEqual(updates, []);
  assert.deepEqual(stamps, []);
});

// ---------------------------------------------------------------------------
section('scenario 7 — Force Re-sync stamps lastSyncedBodyHash on every node');

function makeConv(id: string): Conversation {
  return {
    id,
    title: `Conv ${id}`,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    messageIds: [],
  } as Conversation;
}
function makeNode(over: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    id: over.id,
    conversationId: over.conversationId ?? 'c1',
    kind: over.kind ?? 'markdown',
    title: over.title ?? `Node ${over.id}`,
    contentMarkdown: over.contentMarkdown ?? '',
    position: over.position ?? { x: 0, y: 0 },
    width: over.width ?? 240,
    height: over.height ?? 160,
    tags: over.tags ?? [],
    createdAt: over.createdAt ?? NOW_ISO,
    updatedAt: over.updatedAt ?? NOW_ISO,
  } as CanvasNode;
}

await check('runForceResync calls recordNodeSyncMeta(id, hashMarkdownBody(body), syncedAt) for every node', async () => {
  const nodes = [
    makeNode({ id: 'a', contentMarkdown: 'body of a' }),
    makeNode({ id: 'b', contentMarkdown: 'body of b' }),
    makeNode({ id: 'c', contentMarkdown: '---\nfm: yes\n---\n\nbody of c' }),
  ];
  const stamps: { id: string; hash: string; at: string }[] = [];
  await runForceResync({
    getSnapshot: () => ({
      vaultPath: '/v',
      conversations: [makeConv('c1')],
      nodes,
      edges: [] as Edge[],
    }),
    syncFn: async () => ({ vaultPath: '/v', canvases: 1, notes: 3 }),
    recordLastSync: () => {},
    recordNodeSyncMeta: (id, hash, at) => stamps.push({ id, hash, at }),
    now: () => new Date(NOW_MS),
  });
  assert.equal(stamps.length, 3);
  assert.deepEqual(
    stamps.map((s) => s.id).sort(),
    ['a', 'b', 'c'],
  );
  // Each stamp must use the body hash (frontmatter-stripped).
  const byId = new Map(stamps.map((s) => [s.id, s]));
  assert.equal(byId.get('a')!.hash, hashMarkdownBody('body of a'));
  assert.equal(byId.get('b')!.hash, hashMarkdownBody('body of b'));
  assert.equal(
    byId.get('c')!.hash,
    hashMarkdownBody('---\nfm: yes\n---\n\nbody of c'),
  );
  for (const s of stamps) assert.equal(s.at, NOW_ISO);
});

await check('runForceResync without recordNodeSyncMeta is still allowed (back-compat)', async () => {
  await assert.doesNotReject(
    runForceResync({
      getSnapshot: () => ({
        vaultPath: '/v',
        conversations: [],
        nodes: [],
        edges: [],
      }),
      syncFn: async () => ({ vaultPath: '/v', canvases: 0, notes: 0 }),
      recordLastSync: () => {},
      now: () => new Date(NOW_MS),
    }),
  );
});

await check('runForceResync does NOT stamp when sync throws', async () => {
  let stamps = 0;
  await assert.rejects(
    runForceResync({
      getSnapshot: () => ({
        vaultPath: '/v',
        conversations: [],
        nodes: [makeNode({ id: 'a', contentMarkdown: 'x' })],
        edges: [],
      }),
      syncFn: async () => {
        throw new Error('disk full');
      },
      recordLastSync: () => {},
      recordNodeSyncMeta: () => {
        stamps += 1;
      },
      now: () => new Date(NOW_MS),
    }),
    /disk full/,
  );
  assert.equal(stamps, 0);
});

console.log(`\n✓ ${passed} conflict-detection checks passed.\n`);
