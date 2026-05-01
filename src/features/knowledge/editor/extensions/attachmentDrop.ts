import { EditorView } from '@codemirror/view';
import { attachments } from '../../../../services/attachments';
import { useStore } from '../../../../store';

/**
 * Drag-and-drop handler that ingests dropped files into
 * `services/attachments` and inserts a Markdown reference at the drop
 * position. Images become `![[filename]]` (Obsidian image embed); other
 * files become `[[filename]]`. The original blob lives under
 * `attachments/YYYY-MM/` exactly like the chat panel's drag-drop.
 *
 * Path-only drops (true OS files) are recognised but Tauri webviews give
 * us only `File` objects in the DataTransfer, so we always read bytes.
 */
export function attachmentDrop() {
  return EditorView.domEventHandlers({
    dragover(e) {
      if (!e.dataTransfer) return false;
      const types = Array.from(e.dataTransfer.types);
      if (types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        return true;
      }
      return false;
    },
    drop(e, view) {
      if (!e.dataTransfer) return false;
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return false;
      e.preventDefault();
      // Insert a placeholder, replace once ingestion finishes. Keeps
      // ordering correct if multiple files drop together.
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
      void ingestAndInsert(view, pos, files);
      return true;
    },
    paste(e, view) {
      if (!e.clipboardData) return false;
      const items = Array.from(e.clipboardData.items).filter((i) => i.kind === 'file');
      if (items.length === 0) return false;
      const files = items.map((i) => i.getAsFile()).filter((f): f is File => f !== null);
      if (files.length === 0) return false;
      e.preventDefault();
      const pos = view.state.selection.main.head;
      void ingestAndInsert(view, pos, files);
      return true;
    },
  });
}

async function ingestAndInsert(view: EditorView, pos: number, files: File[]): Promise<void> {
  const placeholders: { from: number; to: number; replacement: string }[] = [];
  // First insert placeholders synchronously so the user sees something.
  const placeholderTexts: string[] = files.map(
    (file) => `![[uploading: ${file.name}]]`,
  );
  const initialInsert = placeholderTexts.join(' ');
  view.dispatch({
    changes: { from: pos, to: pos, insert: initialInsert },
    userEvent: 'input.drop',
  });
  let cursor = pos;
  for (let i = 0; i < files.length; i += 1) {
    const placeholder = placeholderTexts[i];
    placeholders.push({
      from: cursor,
      to: cursor + placeholder.length,
      replacement: '',
    });
    cursor += placeholder.length + (i < files.length - 1 ? 1 : 0);
  }

  // Ingest each file, then replace the placeholder with the final ref.
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const att = await attachments.ingest({
        kind: 'bytes',
        bytes,
        suggestedName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      // Track the attachment so it shows up in chat / canvas references.
      useStore.getState().addAttachment(att);
      const ref = att.kind === 'image' ? `![[${att.filename}]]` : `[[${att.filename}]]`;
      placeholders[i].replacement = ref;
    } catch (err) {
      console.error('attachment ingest failed', err);
      placeholders[i].replacement = `<!-- failed to ingest ${file.name}: ${String(err)} -->`;
    }
  }

  // Apply replacements right-to-left so earlier offsets stay valid.
  const ordered = [...placeholders].sort((a, b) => b.from - a.from);
  view.dispatch({
    changes: ordered.map((p) => ({
      from: p.from,
      to: p.to,
      insert: p.replacement,
    })),
    userEvent: 'input.drop-resolved',
  });
}
