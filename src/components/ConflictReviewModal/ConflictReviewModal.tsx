/**
 * Conflict Review modal — lets the user resolve Refresh-from-Vault
 * conflicts one at a time without auto-merging anything.
 *
 * Design choices in v1.2:
 *
 *   - One row per conflict; three actions per row (Use Vault / Keep
 *     Hypratia / Skip). No bulk-apply yet — review-then-pick keeps
 *     the user in control while the conflict-resolution path is
 *     still new.
 *   - No diff viewer. We show short hashes + a pointer to the path,
 *     and let the user open the file in Obsidian to compare. A real
 *     side-by-side diff lands in v1.3+.
 *   - Baseline-missing conflicts get a distinct warning copy so
 *     first-time users don't read "you both edited this" when in
 *     fact they just opened an existing vault.
 *   - Resolved rows fade out of the list; closing the modal with
 *     unresolved rows preserves them on the next Refresh.
 */

import { useState } from 'react';
import {
  conflictRowsFromDetails,
  warningCopyFor,
  type ConflictRow,
} from '../../services/sync/conflictResolution';
import {
  runKeepHypratia,
  runUseVault,
} from '../../services/storage/ConflictResolutionRunner';
import type { ConflictDetail } from '../../services/sync/conflictClassifier';

type RowState = 'pending' | 'resolving' | 'resolved' | 'skipped' | 'error';

type ConflictReviewModalProps = {
  vaultPath: string;
  details: ConflictDetail[];
  onClose: () => void;
};

export function ConflictReviewModal({
  vaultPath,
  details,
  onClose,
}: ConflictReviewModalProps) {
  const rows = conflictRowsFromDetails(details);
  const [state, setState] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pin a single `syncedAt` for the whole session so every resolution
  // applied here shares a stable last-synced timestamp. Cheap to do
  // here vs. inside the runner — keeps the UI's timeline coherent.
  const [syncedAt] = useState(() => new Date().toISOString());

  const detailsById = new Map(details.map((d) => [d.hypratiaId, d]));

  function transition(hypratiaId: string, next: RowState) {
    setState((prev) => ({ ...prev, [hypratiaId]: next }));
  }
  function recordError(hypratiaId: string, message: string) {
    setErrors((prev) => ({ ...prev, [hypratiaId]: message }));
    transition(hypratiaId, 'error');
  }

  async function onUseVault(row: ConflictRow) {
    const detail = detailsById.get(row.hypratiaId);
    if (!detail) return;
    transition(row.hypratiaId, 'resolving');
    try {
      await runUseVault(vaultPath, detail, syncedAt);
      transition(row.hypratiaId, 'resolved');
    } catch (err) {
      recordError(row.hypratiaId, String(err));
    }
  }
  async function onKeepHypratia(row: ConflictRow) {
    const detail = detailsById.get(row.hypratiaId);
    if (!detail) return;
    transition(row.hypratiaId, 'resolving');
    try {
      await runKeepHypratia(vaultPath, detail, syncedAt);
      transition(row.hypratiaId, 'resolved');
    } catch (err) {
      recordError(row.hypratiaId, String(err));
    }
  }
  function onSkip(row: ConflictRow) {
    transition(row.hypratiaId, 'skipped');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal conflict-review-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Review conflicts ({rows.length})</h2>
          <button type="button" className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="muted">
          Refresh from Vault detected notes where Hypratia and Obsidian
          disagree. Pick the version to keep for each. Nothing has been
          overwritten yet.
        </p>
        <ul className="conflict-review-list">
          {rows.map((row) => {
            const status = state[row.hypratiaId] ?? 'pending';
            const error = errors[row.hypratiaId];
            return (
              <li
                key={row.hypratiaId}
                className={`conflict-review-row conflict-review-row--${status}`}
              >
                <div className="conflict-review-head">
                  <strong>{row.title}</strong>
                  <code className="conflict-review-path">{row.path}</code>
                </div>
                <p
                  className={
                    row.baselineMissing
                      ? 'conflict-review-warning conflict-review-warning--baseline'
                      : 'conflict-review-warning'
                  }
                >
                  {warningCopyFor(row)}
                </p>
                <div className="conflict-review-hashes muted">
                  vault <code>{row.vaultBodyHash}</code> · hypratia{' '}
                  <code>{row.storeBodyHash}</code> · last sync{' '}
                  <code>{row.lastSyncedBodyHash ?? '—'}</code>
                </div>
                {status === 'resolved' || status === 'skipped' ? (
                  <div className="conflict-review-status">
                    {status === 'resolved' ? '✓ Resolved' : 'Skipped — left as-is'}
                  </div>
                ) : (
                  <div className="conflict-review-actions">
                    <button
                      type="button"
                      onClick={() => void onUseVault(row)}
                      disabled={status === 'resolving'}
                    >
                      Use Vault version
                    </button>
                    <button
                      type="button"
                      onClick={() => void onKeepHypratia(row)}
                      disabled={status === 'resolving'}
                    >
                      Keep Hypratia version
                    </button>
                    <button
                      type="button"
                      className="conflict-review-skip"
                      onClick={() => onSkip(row)}
                      disabled={status === 'resolving'}
                    >
                      Skip
                    </button>
                  </div>
                )}
                {error ? (
                  <div className="result error">{error}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <footer className="conflict-review-footer">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
