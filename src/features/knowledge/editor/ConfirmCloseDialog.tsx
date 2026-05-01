import { useEffect } from 'react';

export function ConfirmCloseDialog({
  filename,
  onSave,
  onDiscard,
  onCancel,
}: {
  filename: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="confirm-close-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2>Save changes to {filename}?</h2>
        <p>The note has unsaved edits. Closing without saving will discard them.</p>
        <div className="confirm-close-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="primary" onClick={onSave}>
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
