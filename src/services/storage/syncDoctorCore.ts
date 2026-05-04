/**
 * Pure shape + builder for the Sync Doctor diagnostics report. Lives
 * separate from the Tauri shim (`SyncDoctor.ts`) so the acceptance
 * suite can exercise the formatter without booting the store or
 * touching `@tauri-apps/*`.
 *
 * The Tauri shim does the four moving things (read store, list dirs,
 * stat paths, scan library) and hands the raw observations here. This
 * module is then a deterministic pure function from observations →
 * report. That contract makes the relative-time labels ("12s ago"),
 * the legacy-folder filter, and the OK/WARN/ERROR severity rules
 * easy to test in isolation.
 */

import { formatLastSync } from './forceResyncCore.ts';

/** Three-level severity used to colour each row in the UI. */
export type SyncDoctorSeverity = 'ok' | 'warn' | 'error';

/** One row in the report — keep small + flat for easy table rendering. */
export type SyncDoctorRow = {
  /** Stable id for keyed UI rendering. Not user-visible. */
  id: string;
  /** Short human label ("Vault configured", "Notes path"). */
  label: string;
  /** Right-hand value text ("yes", "no", "12s ago", "/path/..."). */
  value: string;
  /** Drives badge colour. `error` only for things the user must act on. */
  severity: SyncDoctorSeverity;
  /** Optional extra context shown muted under the row. */
  hint?: string;
};

export type SyncDoctorReport = {
  /** Overall worst-severity across all rows. Drives the section header. */
  overall: SyncDoctorSeverity;
  rows: SyncDoctorRow[];
};

/** Raw observations the Tauri shim gathers and hands to the formatter. */
export type SyncDoctorObservations = {
  /** From settings: where the vault is, or undefined if unset. */
  vaultPath?: string;
  /** From settings: where the library backfill source lives, or undefined. */
  libraryRoot?: string;
  /** Filesystem probes against the configured vault path. All `false`
   *  when no vault is configured (the Tauri shim short-circuits). */
  vaultProbes: {
    notesDirExists: boolean;
    canvasesDirExists: boolean;
    sidecarsDirExists: boolean;
  };
  /** Top-level entries in the vault root that match `LLM-*` (the v1.1
   *  layout we migrated away from). Names only, no paths. */
  legacyFolders: string[];
  /** Count of `.md` files in the library outside the `Hypratia/`
   *  subtree — backfill candidates. `null` when no library is set or
   *  the scan has not run yet. */
  libraryPendingCount: number | null;
  /** From settings: ISO timestamps. Both undefined on a fresh install. */
  lastResyncAt?: string;
  lastCanvasAutosaveAt?: string;
  /** Injected for deterministic tests. Defaults to `Date.now()` in the
   *  Tauri shim. */
  now: number;
};

/**
 * Build the report. Pure function — same observations always produce
 * the same rows in the same order. Order matters because the UI renders
 * them top-to-bottom and we want "is the vault even set?" to come
 * before "is autosave alive?".
 */
export function buildSyncDoctorReport(
  obs: SyncDoctorObservations,
): SyncDoctorReport {
  const rows: SyncDoctorRow[] = [];

  // ---- vault configuration ------------------------------------------------
  const vaultConfigured = Boolean(obs.vaultPath);
  rows.push({
    id: 'vault.configured',
    label: 'Vault configured',
    value: vaultConfigured ? 'yes' : 'no',
    severity: vaultConfigured ? 'ok' : 'error',
    hint: vaultConfigured ? obs.vaultPath : 'Pick a vault to enable autosave.',
  });

  // ---- vault subpaths -----------------------------------------------------
  // When no vault is set, all three probes return false; reporting them
  // as "error" would just be noise — the row above already says so.
  // Downgrade to 'warn' so the user isn't double-flagged.
  const subpathSeverity: SyncDoctorSeverity = vaultConfigured ? 'error' : 'warn';
  rows.push({
    id: 'vault.notes',
    label: 'Notes path (Hypratia/Notes)',
    value: obs.vaultProbes.notesDirExists ? 'exists' : 'missing',
    severity: obs.vaultProbes.notesDirExists ? 'ok' : subpathSeverity,
    hint: obs.vaultProbes.notesDirExists
      ? undefined
      : vaultConfigured
        ? 'Created on first node save.'
        : undefined,
  });
  rows.push({
    id: 'vault.canvases',
    label: 'Canvases path (Hypratia/Canvases)',
    value: obs.vaultProbes.canvasesDirExists ? 'exists' : 'missing',
    severity: obs.vaultProbes.canvasesDirExists ? 'ok' : subpathSeverity,
    hint: obs.vaultProbes.canvasesDirExists
      ? undefined
      : vaultConfigured
        ? 'Created on first canvas autosave.'
        : undefined,
  });
  rows.push({
    id: 'vault.sidecars',
    label: 'Sidecars path (Hypratia/.hypratia/sidecars)',
    value: obs.vaultProbes.sidecarsDirExists ? 'exists' : 'missing',
    severity: obs.vaultProbes.sidecarsDirExists ? 'ok' : subpathSeverity,
    hint: obs.vaultProbes.sidecarsDirExists
      ? undefined
      : vaultConfigured
        ? 'Created when sidecar metadata is first written.'
        : undefined,
  });

  // ---- liveness: timestamps ----------------------------------------------
  rows.push({
    id: 'time.last-resync',
    label: 'Last force re-sync',
    value: formatLastSync(obs.lastResyncAt, obs.now),
    severity: 'ok',
    hint: obs.lastResyncAt,
  });
  rows.push({
    id: 'time.last-autosave',
    label: 'Last canvas autosave',
    value: formatLastSync(obs.lastCanvasAutosaveAt, obs.now),
    severity: 'ok',
    hint: obs.lastCanvasAutosaveAt
      ? obs.lastCanvasAutosaveAt
      : 'Fires after each move/edit; nothing to write yet on a fresh vault.',
  });

  // ---- legacy LLM-* folders ----------------------------------------------
  // Surfaces only when a vault is configured — without one, there is
  // nothing to scan.
  if (vaultConfigured) {
    const legacy = obs.legacyFolders;
    const detected = legacy.length > 0;
    rows.push({
      id: 'legacy.folders',
      label: 'Legacy LLM-* folders',
      value: detected ? `${legacy.length} detected` : 'none',
      severity: detected ? 'warn' : 'ok',
      hint: detected
        ? `Run Settings → Migrate legacy vault to fold these into Hypratia/. (${legacy.join(', ')})`
        : undefined,
    });
  }

  // ---- library backfill ---------------------------------------------------
  if (obs.libraryRoot) {
    const pending = obs.libraryPendingCount;
    if (pending === null) {
      rows.push({
        id: 'library.pending',
        label: 'Library files pending backfill',
        value: 'not scanned',
        severity: 'warn',
        hint: 'Open Settings → Library backfill to plan the next pass.',
      });
    } else {
      rows.push({
        id: 'library.pending',
        label: 'Library files pending backfill',
        value: pending === 0 ? 'none' : String(pending),
        severity: pending === 0 ? 'ok' : 'warn',
        hint:
          pending === 0
            ? undefined
            : 'Run Settings → Library backfill to import them under Hypratia/Notes.',
      });
    }
  }

  return {
    overall: worstSeverity(rows),
    rows,
  };
}

/** error > warn > ok. Used for the section header indicator. */
export function worstSeverity(rows: SyncDoctorRow[]): SyncDoctorSeverity {
  let worst: SyncDoctorSeverity = 'ok';
  for (const r of rows) {
    if (r.severity === 'error') return 'error';
    if (r.severity === 'warn') worst = 'warn';
  }
  return worst;
}

/**
 * Filter helper used by the Tauri shim to keep the implementation
 * decoupled from the shape decision. "Legacy" = top-level dirs whose
 * name starts with `LLM-` (the pre-Hypratia layout we migrate away
 * from). Pure so it's testable without filesystem access.
 */
export function isLegacyTopLevelFolder(name: string): boolean {
  return /^LLM-/.test(name);
}
