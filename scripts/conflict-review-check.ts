/**
 * Acceptance tests for the Conflict Review modal's resolution path.
 *
 * Run with `pnpm check:conflict-review`. Pure-function tests against:
 *
 *   - `services/sync/conflictClassifier.ts`  — `'conflict-no-baseline'`
 *                                              tagged distinctly from
 *                                              `'conflict'`
 *   - `services/sync/conflictResolution.ts`  — `resolveUseVault`,
 *                                              `resolveKeepHypratia`,
 *                                              `resolveSkip`,
 *                                              `conflictRowsFromDetails`,
 *                                              `warningCopyFor`
 *
 * The React modal (`components/ConflictReviewModal/ConflictReviewModal.tsx`)
 * is exercised by hand from inside the running app — its only state
 * is row-status flags, the actual resolution work all routes through
 * the pure helpers verified here.
 *
 * Coverage maps to the implementation prompt:
 *   - Use Vault version updates store body and syncMeta
 *   - Keep Hypratia version writes to vault and updates syncMeta
 *   - Skip leaves both sides untouched
 *   - baseline-missing shows the correct warning
 *   - conflict list renders correctly from RefreshSummary.conflictDetails
 */

import assert from 'node:assert/strict';
import { hashMarkdownBody } from '../src/services/sync/bodyHash.ts';
import {
  classifyConflict,
  type ConflictDetail,
  type ConflictKind,
} from '../src/services/sync/conflictClassifier.ts';
import {
  conflictRowsFromDetails,
  resolveKeepHypratia,
  resolveSkip,
  resolveUseVault,
  warningCopyFor,
  type ResolveDeps,
} from '../src/services/sync/conflictResolution.ts';

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

function makeDetail(over: Partial<ConflictDetail> & { hypratiaId: string }): ConflictDetail {
  return {
    hypratiaId: over.hypratiaId,
    path: over.path ?? `Hypratia/Notes/${over.hypratiaId}.md`,
    title: over.title ?? `Note ${over.hypratiaId}`,
    vaultBodyHash: over.vaultBodyHash ?? 'aaaaaaaa',
    storeBodyHash: over.storeBodyHash ?? 'bbbbbbbb',
    lastSyncedBodyHash: over.lastSyncedBodyHash,
    reason: over.reason ?? ('conflict' as ConflictKind),
  };
}

type SpyDeps = ResolveDeps & {
  calls: {
    readVaultBody: string[];
    readStoreBody: string[];
    updateNodeBody: { id: string; body: string }[];
    writeVaultBody: { path: string; body: string }[];
    recordSyncedHash: { id: string; hash: string; at: string }[];
  };
};

function makeSpyDeps(over: Partial<{
  vaultBodyByPath: Record<string, string>;
  storeBodyById: Record<string, string>;
  failWriteFor?: string;
}> = {}): SpyDeps {
  const calls: SpyDeps['calls'] = {
    readVaultBody: [],
    readStoreBody: [],
    updateNodeBody: [],
    writeVaultBody: [],
    recordSyncedHash: [],
  };
  return {
    calls,
    syncedAt: NOW_ISO,
    readVaultBody: async (relPath) => {
      calls.readVaultBody.push(relPath);
      const body = over.vaultBodyByPath?.[relPath] ?? '';
      return { body, hash: hashMarkdownBody(body) };
    },
    readStoreBody: (id) => {
      calls.readStoreBody.push(id);
      return over.storeBodyById?.[id] ?? '';
    },
    updateNodeBody: (id, body) => {
      calls.updateNodeBody.push({ id, body });
    },
    writeVaultBody: async (relPath, body) => {
      if (over.failWriteFor === relPath) throw new Error('disk full');
      calls.writeVaultBody.push({ path: relPath, body });
    },
    recordSyncedHash: (id, hash, at) => {
      calls.recordSyncedHash.push({ id, hash, at });
    },
  };
}

// ---------------------------------------------------------------------------
section('classifier: baseline-missing is tagged distinctly from regular conflict');

await check('no baseline + sides differ → classifyConflict returns conflict-no-baseline', () => {
  assert.equal(
    classifyConflict({ vaultBodyHash: 'X', storeBodyHash: 'Y' }),
    'conflict-no-baseline',
  );
});

await check('baseline present + both sides diverge → classifyConflict returns plain conflict', () => {
  assert.equal(
    classifyConflict({
      vaultBodyHash: 'X',
      storeBodyHash: 'Y',
      lastSyncedBodyHash: 'Z',
    }),
    'conflict',
  );
});

// ---------------------------------------------------------------------------
section('view-model: conflictRowsFromDetails');

await check('one row per conflict, baselineMissing flag derived from reason', () => {
  const details: ConflictDetail[] = [
    makeDetail({ hypratiaId: 'a', reason: 'conflict' }),
    makeDetail({
      hypratiaId: 'b',
      reason: 'conflict-no-baseline',
      lastSyncedBodyHash: undefined,
    }),
  ];
  const rows = conflictRowsFromDetails(details);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].hypratiaId, 'a');
  assert.equal(rows[0].baselineMissing, false);
  assert.equal(rows[1].hypratiaId, 'b');
  assert.equal(rows[1].baselineMissing, true);
  assert.equal(rows[1].lastSyncedBodyHash, undefined);
});

await check('falls back to "(untitled)" when title is empty', () => {
  const rows = conflictRowsFromDetails([
    makeDetail({ hypratiaId: 'x', title: '' }),
  ]);
  assert.equal(rows[0].title, '(untitled)');
});

await check('renders empty list when no conflicts', () => {
  assert.deepEqual(conflictRowsFromDetails([]), []);
});

// ---------------------------------------------------------------------------
section('view-model: warningCopyFor distinguishes baseline-missing');

await check('baseline-missing row → "No previous sync baseline exists" copy', () => {
  const copy = warningCopyFor({ baselineMissing: true });
  assert.match(copy, /No previous sync baseline/);
});

await check('regular conflict → "both… changed" copy', () => {
  const copy = warningCopyFor({ baselineMissing: false });
  assert.match(copy, /Both Hypratia and Obsidian/);
  assert.doesNotMatch(copy, /baseline/i);
});

// ---------------------------------------------------------------------------
section('resolveUseVault — re-reads vault, updates store body, stamps syncMeta');

await check('reads from the vault path declared in the detail', async () => {
  const detail = makeDetail({
    hypratiaId: 'n1',
    path: 'Hypratia/Notes/n1.md',
  });
  const deps = makeSpyDeps({
    vaultBodyByPath: { 'Hypratia/Notes/n1.md': 'pulled body' },
  });
  const outcome = await resolveUseVault(detail, deps);
  assert.deepEqual(deps.calls.readVaultBody, ['Hypratia/Notes/n1.md']);
  assert.equal(outcome.action, 'use-vault');
  assert.equal(outcome.newHash, hashMarkdownBody('pulled body'));
});

await check('writes the vault body to the store and stamps the new hash', async () => {
  const detail = makeDetail({ hypratiaId: 'n1' });
  const deps = makeSpyDeps({
    vaultBodyByPath: { 'Hypratia/Notes/n1.md': 'fresh from obsidian' },
  });
  await resolveUseVault(detail, deps);
  assert.deepEqual(deps.calls.updateNodeBody, [
    { id: 'n1', body: 'fresh from obsidian' },
  ]);
  assert.deepEqual(deps.calls.recordSyncedHash, [
    {
      id: 'n1',
      hash: hashMarkdownBody('fresh from obsidian'),
      at: NOW_ISO,
    },
  ]);
});

await check('Use Vault never writes back to the vault', async () => {
  const detail = makeDetail({ hypratiaId: 'n1' });
  const deps = makeSpyDeps({
    vaultBodyByPath: { 'Hypratia/Notes/n1.md': 'whatever' },
  });
  await resolveUseVault(detail, deps);
  assert.equal(deps.calls.writeVaultBody.length, 0);
});

// ---------------------------------------------------------------------------
section('resolveKeepHypratia — reads store, writes vault, stamps syncMeta');

await check('reads the live store body (not the scan-time hash)', async () => {
  const detail = makeDetail({
    hypratiaId: 'n1',
    storeBodyHash: 'STALE_SCAN_HASH',
  });
  const deps = makeSpyDeps({
    storeBodyById: { n1: 'edited after scan' },
  });
  const outcome = await resolveKeepHypratia(detail, deps);
  assert.deepEqual(deps.calls.readStoreBody, ['n1']);
  // The stamped hash reflects the LIVE body, not the scan-time hash.
  assert.equal(outcome.newHash, hashMarkdownBody('edited after scan'));
  assert.notEqual(outcome.newHash, 'STALE_SCAN_HASH');
});

await check('writes the live Hypratia body to the vault path', async () => {
  const detail = makeDetail({
    hypratiaId: 'n1',
    path: 'Hypratia/Notes/n1.md',
  });
  const deps = makeSpyDeps({
    storeBodyById: { n1: 'hypratia wins' },
  });
  await resolveKeepHypratia(detail, deps);
  assert.deepEqual(deps.calls.writeVaultBody, [
    { path: 'Hypratia/Notes/n1.md', body: 'hypratia wins' },
  ]);
  assert.deepEqual(deps.calls.recordSyncedHash, [
    {
      id: 'n1',
      hash: hashMarkdownBody('hypratia wins'),
      at: NOW_ISO,
    },
  ]);
});

await check('does NOT update the store body (keeping is a no-op for the store)', async () => {
  const detail = makeDetail({ hypratiaId: 'n1' });
  const deps = makeSpyDeps({ storeBodyById: { n1: 'stays put' } });
  await resolveKeepHypratia(detail, deps);
  assert.deepEqual(deps.calls.updateNodeBody, []);
});

await check('does NOT stamp syncMeta when the vault write throws', async () => {
  const detail = makeDetail({
    hypratiaId: 'n1',
    path: 'Hypratia/Notes/n1.md',
  });
  const deps = makeSpyDeps({
    storeBodyById: { n1: 'hypratia body' },
    failWriteFor: 'Hypratia/Notes/n1.md',
  });
  await assert.rejects(resolveKeepHypratia(detail, deps), /disk full/);
  assert.deepEqual(deps.calls.recordSyncedHash, []);
});

// ---------------------------------------------------------------------------
section('resolveSkip — pure no-op marker');

await check('returns the skip outcome without any I/O', () => {
  const detail = makeDetail({ hypratiaId: 'n1' });
  const outcome = resolveSkip(detail);
  assert.deepEqual(outcome, { hypratiaId: 'n1', action: 'skip' });
});

await check('skip carries no newHash (nothing was synced)', () => {
  const outcome = resolveSkip(makeDetail({ hypratiaId: 'n1' }));
  assert.equal(outcome.newHash, undefined);
});

console.log(`\n✓ ${passed} conflict-review checks passed.\n`);
