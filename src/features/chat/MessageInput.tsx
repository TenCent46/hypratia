import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import {
  matchSlashCommands,
  type SlashCommand,
} from './slashCommands';
import type { Attachment, ID } from '../../types';
import type { ChatMode } from './useChatStream';
import { ComposerActionMenu } from './composer/ComposerActionMenu';
import { COMPOSER_MODE_LABEL } from './composer/ComposerMode';

const MAX_INPUT_HEIGHT = 240;

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

export function MessageInput({
  onSend,
  streaming,
  onAbort,
  mode,
  onModeChange,
  onSlashCommand,
}: {
  onSend: (text: string, attachmentIds: ID[]) => void | Promise<void>;
  streaming: boolean;
  onAbort: () => void;
  mode: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  onSlashCommand?: (cmd: SlashCommand, args: string) => void;
}) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const dragCounter = useRef(0);
  const addAttachment = useStore((s) => s.addAttachment);

  const slashMatches = useMemo(() => matchSlashCommands(text), [text]);
  // Clamp the highlight to the current candidate list (no extra effect needed).
  const effectiveSlashIndex =
    slashMatches.length === 0
      ? 0
      : Math.max(0, Math.min(slashIndex, slashMatches.length - 1));

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

  // Allow other parts of the app (e.g., chat selection right-click → Ask)
  // to push a quoted block into the composer. Appends to whatever the
  // user already typed so an in-flight question is preserved, then
  // focuses the textarea so they can type their question right away.
  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent<{ quoted?: string; text?: string }>)
        .detail;
      if (!detail) return;
      const quoted = detail.quoted?.trim();
      const verbatim = detail.text;
      setText((current) => {
        const block = quoted
          ? `${quoted
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')}\n\n`
          : verbatim ?? '';
        if (!block) return current;
        return current ? `${current}\n${block}` : block;
      });
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    }
    window.addEventListener('mc:chat-prefill', onPrefill as EventListener);
    return () =>
      window.removeEventListener(
        'mc:chat-prefill',
        onPrefill as EventListener,
      );
  }, []);

  function send() {
    const trimmed = text.trim();
    if (!trimmed && pending.length === 0) return;
    // Slash-command interception
    if (trimmed.startsWith('/') && onSlashCommand) {
      const parsed = (() => {
        const space = trimmed.indexOf(' ');
        const head = space === -1 ? trimmed : trimmed.slice(0, space);
        const args = space === -1 ? '' : trimmed.slice(space + 1).trim();
        return { head, args };
      })();
      const cmd = slashMatches.find((c) => c.trigger === parsed.head);
      if (cmd) {
        onSlashCommand(cmd, parsed.args);
        setText('');
        setPending([]);
        return;
      }
    }
    void onSend(trimmed, pending.map((a) => a.id));
    setText('');
    setPending([]);
  }

  function applySlash(cmd: SlashCommand) {
    setText(`${cmd.trigger} `);
    setSlashIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Slash-command palette navigation
    if (slashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = slashMatches[effectiveSlashIndex];
        if (cmd) applySlash(cmd);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      // Cmd/Ctrl+Enter inserts a newline (handled by default after preventing the
      // browser's quirks). We just let the textarea insert the newline naturally
      // by NOT calling preventDefault — but on macOS some browsers don't insert
      // a newline on Cmd+Enter, so insert it manually.
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart ?? text.length;
      const end = ta.selectionEnd ?? text.length;
      const next = text.slice(0, start) + '\n' + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1;
      });
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      // Shift+Enter: newline (default textarea behavior)
      return;
    }
    if (
      e.key === 'Enter' &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey) && streaming) {
      e.preventDefault();
      onAbort();
    }
  }

  async function ingestFile(file: File): Promise<Attachment | null> {
    try {
      const buf = await file.arrayBuffer();
      const att = await attachments.ingest({
        kind: 'bytes',
        bytes: new Uint8Array(buf),
        suggestedName: file.name || 'file',
        mimeType: file.type || 'application/octet-stream',
        conversationId: useStore.getState().settings.lastConversationId,
      });
      addAttachment(att);
      return att;
    } catch {
      return null;
    }
  }

  async function ingestFiles(files: File[]) {
    const added: Attachment[] = [];
    for (const f of files) {
      const att = await ingestFile(f);
      if (att) added.push(att);
    }
    if (added.length > 0) setPending((p) => [...p, ...added]);
  }

  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== 'file') continue;
      const f = it.getAsFile();
      if (f) files.push(f);
    }
    if (files.length === 0) return;
    e.preventDefault();
    await ingestFiles(files);
  }

  function onPickFiles() {
    fileInputRef.current?.click();
  }

  async function onFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    await ingestFiles(files);
  }

  function removePending(id: ID) {
    setPending((p) => p.filter((a) => a.id !== id));
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragOver(true);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragOver(false);
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await ingestFiles(files);
  }

  const canSend = !streaming && (text.trim().length > 0 || pending.length > 0);

  return (
    <div
      className={`message-input${dragOver ? ' drag-over' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {slashMatches.length > 0 ? (
        <div className="slash-palette">
          {slashMatches.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              className={`slash-row${i === effectiveSlashIndex ? ' active' : ''}`}
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => applySlash(cmd)}
            >
              <div className="slash-trigger">{cmd.trigger}</div>
              <div className="slash-meta">
                <div className="slash-label">{cmd.label}</div>
                <div className="slash-desc">{cmd.description}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {pending.length > 0 ? (
        <div className="message-input-attachments">
          {pending.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={() => removePending(a.id)}
            />
          ))}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        className="message-input-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={
          streaming ? 'Streaming… ⌘⌫ to stop' : 'Reply…'
        }
        rows={1}
        disabled={streaming}
      />
      <div className="message-input-controls">
        <div className="composer-menu-anchor">
          <button
            ref={plusButtonRef}
            type="button"
            className={`message-input-icon${menuOpen ? ' active' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            disabled={streaming}
            aria-label="Composer actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Add files, skills, search…"
          >
            <PlusIcon />
          </button>
          <ComposerActionMenu
            open={menuOpen}
            anchorRef={plusButtonRef}
            onClose={() => setMenuOpen(false)}
            onPickFiles={onPickFiles}
            mode={mode}
            onModeChange={(m) => onModeChange?.(m)}
          />
        </div>
        <span className="message-input-spacer" />
        {mode !== 'chat' ? (
          <button
            type="button"
            className="message-input-mode-chip"
            onClick={() => onModeChange?.('chat')}
            title={`${COMPOSER_MODE_LABEL[mode]} mode active — click to clear`}
          >
            {COMPOSER_MODE_LABEL[mode]}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {streaming ? (
          <button
            type="button"
            className="message-input-send-circle stop"
            onClick={onAbort}
            aria-label="Stop streaming"
            title="Stop"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            className="message-input-send-circle"
            onClick={send}
            disabled={!canSend}
            aria-label="Send message"
            title="Send"
          >
            <ArrowUpIcon />
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onFilesChange}
      />
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (attachment.kind === 'image') {
      attachments
        .toUrl(attachment)
        .then((url) => {
          if (!cancelled) setThumb(url);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  const sizeKb = Math.max(1, Math.round(attachment.bytes / 1024));
  return (
    <div className="attachment-chip" title={attachment.filename}>
      {thumb ? (
        <img className="attachment-chip-thumb" src={thumb} alt="" />
      ) : (
        <span className="attachment-chip-icon" aria-hidden="true">
          {attachment.kind === 'pdf' ? '📄' : '📎'}
        </span>
      )}
      <span className="attachment-chip-name">{attachment.filename}</span>
      <span className="attachment-chip-meta">{sizeKb} KB</span>
      <button
        type="button"
        className="attachment-chip-remove"
        onClick={onRemove}
        aria-label="Remove attachment"
      >
        ×
      </button>
    </div>
  );
}
