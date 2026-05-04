/**
 * Acceptance tests for the Sync Doctor diagnostics report.
 *
 * Run with `pnpm check:sync-doctor`. Pure-function tests against
 * `services/storage/syncDoctorCore` — the Tauri-side shim
 * (`SyncDoctor.ts`) is exercised by hand from inside the running app
 * since it touches the live store and `@tauri-apps/plugin-fs`.
 *
 * Coverage:
 *   1. shape: 6 baseline rows always emitted in the right order
 *   2. severity routing — vault unset is the only `error`, missing
 *      subpaths under an unset vault demote to `warn`
 *   3. legacy-folder filter only fires when a vault is configured
 *   4. library backfill row: shape varies with libraryRoot present /
 *      absent and pendingCount null / 0 / >0
 *   5. relative-time labels read straight from `formatLastSync`
 *   6. `worstSeverity` ordering: error > warn > ok
 *   7. `isLegacyTopLevelFolder` matches `LLM-*` and only `LLM-*`
 */

import assert from 'node:assert/strict';
import {
  buildSyncDoctorReport,
  isLegacyTopLevelFolder,
  worstSeverity,
  type SyncDoctorObservations,
  type SyncDoctorRow,
} from '../src/services/storage/syncDoctorCore.ts';

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

function obs(over: Partial<SyncDoctorObservations> = {}): SyncDoctorObservations {
  return {
    vaultPath: undefined,
    libraryRoot: undefined,
    vaultProbes: {
      notesDirExists: false,
      canvasesDirExists: false,
      sidecarsDirExists: false,
    },
    legacyFolders: [],
    libraryPendingCount: null,
    lastResyncAt: undefined,
    lastCanvasAutosaveAt: undefined,
    now: NOW_MS,
    ...over,
  };
}

function rowById(rows: SyncDoctorRow[], id: string): SyncDoctorRow | undefined {
  return rows.find((r) => r.id === id);
}

// ---------------------------------------------------------------------------
section('row order + baseline shape');

await check('emits the 6 always-on rows in deterministic order', () => {
  const report = buildSyncDoctorReport(obs());
  const ids = report.rows.map((r) => r.id);
  assert.deepEqual(ids, [
    'vault.configured',
    'vault.notes',
    'vault.canvases',
    'vault.sidecars',
    'time.last-resync',
    'time.last-autosave',
  ]);
});

await check('vault-configured row holds the path as a hint when set', () => {
  const report = buildSyncDoctorReport(obs({ vaultPath: '/Users/me/Vault' }));
  const row = rowById(report.rows, 'vault.configured');
  assert.equal(row?.value, 'yes');
  assert.equal(row?.severity, 'ok');
  assert.equal(row?.hint, '/Users/me/Vault');
});

// ---------------------------------------------------------------------------
section('severity routing');

await check(
  'vault unset → vault-configured row is `error`; subpath rows demote to `warn`',
  () => {
    const report = buildSyncDoctorReport(obs());
    assert.equal(rowById(report.rows, 'vault.configured')?.severity, 'error');
    assert.equal(rowById(report.rows, 'vault.notes')?.severity, 'warn');
    assert.equal(rowById(report.rows, 'vault.canvases')?.severity, 'warn');
    assert.equal(rowById(report.rows, 'vault.sidecars')?.severity, 'warn');
    assert.equal(report.overall, 'error');
  },
);

await check(
  'vault set but subpaths missing → subpath rows are `error`',
  () => {
    const report = buildSyncDoctorReport(
      obs({ vaultPath: '/v', vaultProbes: {
        notesDirExists: false,
        canvasesDirExists: false,
        sidecarsDirExists: false,
      } }),
    );
    assert.equal(rowById(report.rows, 'vault.notes')?.severity, 'error');
    assert.equal(rowById(report.rows, 'vault.canvases')?.severity, 'error');
    assert.equal(rowById(report.rows, 'vault.sidecars')?.severity, 'error');
  },
);

await check('all subpaths present → every vault row is `ok`', () => {
  const report = buildSyncDoctorReport(
    obs({
      vaultPath: '/v',
      vaultProbes: {
        notesDirExists: true,
        canvasesDirExists: true,
        sidecarsDirExists: true,
      },
    }),
  );
  for (const id of [
    'vault.configured',
    'vault.notes',
    'vault.canvases',
    'vault.sidecars',
  ]) {
    assert.equal(
      rowById(report.rows, id)?.severity,
      'ok',
      `expected ${id} to be ok`,
    );
  }
});

// ---------------------------------------------------------------------------
section('legacy LLM-* folder detection');

await check('legacy row is suppressed when no vault is configured', () => {
  const report = buildSyncDoctorReport(
    obs({ legacyFolders: ['LLM-Conversations'] }),
  );
  assert.equal(rowById(report.rows, 'legacy.folders'), undefined);
});

await check('legacy row appears with `ok` when vault is set + no leftovers', () => {
  const report = buildSyncDoctorReport(
    obs({ vaultPath: '/v', legacyFolders: [] }),
  );
  const row = rowById(report.rows, 'legacy.folders');
  assert.equal(row?.value, 'none');
  assert.equal(row?.severity, 'ok');
});

await check('legacy row counts and warns when leftovers found', () => {
  const report = buildSyncDoctorReport(
    obs({
      vaultPath: '/v',
      // Healthy vault subpaths — isolate the warn signal to legacy folders.
      vaultProbes: {
        notesDirExists: true,
        canvasesDirExists: true,
        sidecarsDirExists: true,
      },
      legacyFolders: ['LLM-Conversations', 'LLM-Daily'],
    }),
  );
  const row = rowById(report.rows, 'legacy.folders');
  assert.equal(row?.value, '2 detected');
  assert.equal(row?.severity, 'warn');
  assert.match(row?.hint ?? '', /Migrate legacy vault/);
  assert.equal(report.overall, 'warn', 'legacy leftovers should bump overall to warn');
});

// ---------------------------------------------------------------------------
section('library backfill row');

await check('row absent when no library is configured', () => {
  const report = buildSyncDoctorReport(obs({ vaultPath: '/v' }));
  assert.equal(rowById(report.rows, 'library.pending'), undefined);
});

await check('library configured + pendingCount null → "not scanned" warn', () => {
  const report = buildSyncDoctorReport(
    obs({
      vaultPath: '/v',
      libraryRoot: '/lib',
      libraryPendingCount: null,
    }),
  );
  const row = rowById(report.rows, 'library.pending');
  assert.equal(row?.value, 'not scanned');
  assert.equal(row?.severity, 'warn');
});

await check('pendingCount 0 → ok / "none"', () => {
  const report = buildSyncDoctorReport(
    obs({
      vaultPath: '/v',
      libraryRoot: '/lib',
      libraryPendingCount: 0,
    }),
  );
  const row = rowById(report.rows, 'library.pending');
  assert.equal(row?.value, 'none');
  assert.equal(row?.severity, 'ok');
});

await check('pendingCount >0 → warn with the count rendered', () => {
  const report = buildSyncDoctorReport(
    obs({
      vaultPath: '/v',
      libraryRoot: '/lib',
      libraryPendingCount: 7,
    }),
  );
  const row = rowById(report.rows, 'library.pending');
  assert.equal(row?.value, '7');
  assert.equal(row?.severity, 'warn');
});

// ---------------------------------------------------------------------------
section('relative-time labels');

await check('last-resync row reads "never" when no timestamp is set', () => {
  const report = buildSyncDoctorReport(obs({ vaultPath: '/v' }));
  assert.equal(rowById(report.rows, 'time.last-resync')?.value, 'never');
});

await check('last-resync row reads "X min ago" when a timestamp is set', () => {
  const iso = new Date(NOW_MS - 12 * 60_000).toISOString();
  const report = buildSyncDoctorReport(
    obs({ vaultPath: '/v', lastResyncAt: iso }),
  );
  assert.equal(rowById(report.rows, 'time.last-resync')?.value, '12 min ago');
});

await check('last-autosave row mirrors the same formatter', () => {
  const iso = new Date(NOW_MS - 30_000).toISOString();
  const report = buildSyncDoctorReport(
    obs({ vaultPath: '/v', lastCanvasAutosaveAt: iso }),
  );
  assert.equal(rowById(report.rows, 'time.last-autosave')?.value, '30s ago');
});

// ---------------------------------------------------------------------------
section('worstSeverity helper');

await check('error beats warn beats ok', () => {
  const baseRow = (severity: 'ok' | 'warn' | 'error'): SyncDoctorRow => ({
    id: 'r',
    label: 'r',
    value: 'r',
    severity,
  });
  assert.equal(worstSeverity([baseRow('ok'), baseRow('ok')]), 'ok');
  assert.equal(worstSeverity([baseRow('ok'), baseRow('warn')]), 'warn');
  assert.equal(worstSeverity([baseRow('warn'), baseRow('error')]), 'error');
  assert.equal(
    worstSeverity([baseRow('error'), baseRow('ok')]),
    'error',
    'short-circuits on first error',
  );
});

// ---------------------------------------------------------------------------
section('isLegacyTopLevelFolder');

await check('matches LLM-* names', () => {
  assert.equal(isLegacyTopLevelFolder('LLM-Conversations'), true);
  assert.equal(isLegacyTopLevelFolder('LLM-Maps'), true);
  assert.equal(isLegacyTopLevelFolder('LLM-Daily'), true);
});

await check('does NOT match Hypratia / unrelated names', () => {
  assert.equal(isLegacyTopLevelFolder('Hypratia'), false);
  assert.equal(isLegacyTopLevelFolder('Notes'), false);
  assert.equal(isLegacyTopLevelFolder('llm-lower'), false, 'case-sensitive');
  assert.equal(isLegacyTopLevelFolder(''), false);
});

console.log(`\n✓ ${passed} sync-doctor checks passed.\n`);
