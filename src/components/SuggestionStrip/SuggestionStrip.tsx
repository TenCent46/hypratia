import { useState } from 'react';

/**
 * Plan 50 — `SuggestionStrip` primitive used wherever Hypratia surfaces an
 * automated suggestion. The half-automation rule: never mutate the canvas /
 * memory / vault without an explicit user gesture in the same flow. This
 * component encodes the rule once so every consumer renders the same accept
 * / dismiss affordance.
 *
 * Consumers pass:
 *  - `items` — chips to display.
 *  - `onAccept(ids)` — fired when the user clicks Accept; called with the
 *    currently-checked subset.
 *  - `onDismiss?` — optional; the user dismissed without accepting.
 *  - `rememberKey?` — when set, dismissal persists across reloads via
 *    localStorage so the same suggestion does not re-prompt forever.
 */
export type SuggestionItem = {
  id: string;
  label: string;
  detail?: string;
};

export function SuggestionStrip({
  title,
  items,
  primaryLabel = 'Add',
  onAccept,
  onDismiss,
  rememberKey,
  defaultChecked = true,
}: {
  title?: string;
  items: SuggestionItem[];
  primaryLabel?: string;
  onAccept: (acceptedIds: string[]) => void;
  onDismiss?: () => void;
  rememberKey?: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const item of items) out[item.id] = defaultChecked;
    return out;
  });
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || items.length === 0) return null;
  // If we've persisted a dismissal for this rememberKey, hide silently.
  if (rememberKey && typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(`hyp-suggest-dismiss:${rememberKey}`)) {
        return null;
      }
    } catch {
      /* storage unavailable — fall through and render */
    }
  }

  const acceptedIds = items.filter((i) => checked[i.id]).map((i) => i.id);

  function handleDismiss() {
    setDismissed(true);
    if (rememberKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`hyp-suggest-dismiss:${rememberKey}`, '1');
      } catch {
        /* ignore */
      }
    }
    onDismiss?.();
  }

  return (
    <div className="suggestion-strip" role="group" aria-label={title ?? 'Suggestions'}>
      {title ? <div className="suggestion-strip-title">{title}</div> : null}
      <ul className="suggestion-strip-items">
        {items.map((item) => (
          <li key={item.id}>
            <label className="suggestion-strip-chip">
              <input
                type="checkbox"
                checked={!!checked[item.id]}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))
                }
              />
              <span className="suggestion-strip-chip-label">{item.label}</span>
              {item.detail ? (
                <span className="suggestion-strip-chip-detail">{item.detail}</span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
      <div className="suggestion-strip-actions">
        <button
          type="button"
          className="suggestion-strip-secondary"
          onClick={handleDismiss}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="suggestion-strip-primary"
          disabled={acceptedIds.length === 0}
          onClick={() => onAccept(acceptedIds)}
        >
          {primaryLabel} ({acceptedIds.length})
        </button>
      </div>
    </div>
  );
}
