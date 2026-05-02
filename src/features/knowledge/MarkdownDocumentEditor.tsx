import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import {
  markdownFiles,
  resolveMarkdownRoot,
} from '../../services/storage/MarkdownFileService';
import { isMirroredFile } from '../../services/knowledge/conversationMarkdownMirror';
import { MarkdownEditorView, type MarkdownEditorViewHandle } from './editor/MarkdownEditorView';
import { EditorContextMenu } from './editor/EditorContextMenu';
import type { EditorContextMenuItem } from './editor/EditorContextMenu';
import { registerEditor } from './editor/editorRegistry';
import { resolveKbWikilinkTarget } from './editor/extensions/wikilink';
import {
  findLinkHrefAt,
  openMarkdownLinkExternal,
} from './editor/extensions/markdownLinkClick';
import { EditorSidePanel } from './editor/EditorSidePanel';
import { PropertiesEditor } from './editor/PropertiesEditor';
import { findAnchorLine } from './editor/sidePanel';
import { reimportMarkdownIntoChat } from '../../services/knowledge/conversationMarkdownReimport';
import { KbReadingView } from './editor/KbReadingView';

type EditorMode = 'live-preview' | 'source' | 'reading';

function fileNameFromPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'Untitled.md';
}

function stemFromPath(path: string): string {
  return fileNameFromPath(path).replace(/\.md$/i, '');
}

function fileNameFromTitle(value: string): string {
  const stem = value
    .trim()
    .replace(/[/:\\]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '')
    .replace(/\.md$/i, '')
    .trim();
  return `${stem || 'Untitled'}.md`;
}

function truncateForMenu(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function MarkdownDocumentEditor({
  path,
  onClose,
  onOpenInWindow,
}: {
  path: string;
  onClose: () => void;
  onOpenInWindow?: () => void;
}) {
  const configuredRoot = useStore((s) => s.settings.markdownStorageDir);
  const markdownAutoSave = useStore(
    (s) => s.settings.markdownAutoSave ?? true,
  );
  const updateNode = useStore((s) => s.updateNode);
  const openAiPalette = useStore((s) => s.openAiPalette);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const linkedNodeId = useStore(
    (s) => s.nodes.find((n) => n.mdPath === path)?.id ?? null,
  );

  const [rootPath, setRootPath] = useState('');
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: EditorContextMenuItem[];
  } | null>(null);
  // Side panel (Outline / Backlinks / Tags / Suggested) starts collapsed
  // so the editor opens with the document text taking the full width.
  // The user can expand it by clicking any tab icon on the rail.
  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('live-preview');
  const [reimportToast, setReimportToast] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(() => stemFromPath(path));
  const [insertPrompt, setInsertPrompt] = useState<{
    kind: 'link' | 'image';
    text: string;
    url: string;
    range: { from: number; to: number };
  } | null>(null);
  const editorRef = useRef<MarkdownEditorViewHandle | null>(null);
  const contentRef = useRef('');
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const titleCommitRef = useRef(false);

  const dirty = content !== savedContent;
  const documentReady = loadedPath === path && !loading && !error && rootPath;
  const showLoading = !error && (loading || loadedPath !== path);
  const isMirror = useMemo(() => isMirroredFile(savedContent), [savedContent]);
  const breadcrumb = useMemo(() => path.split('/').filter(Boolean), [path]);
  const titleStem = useMemo(() => stemFromPath(path), [path]);
  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return { words, chars: content.length };
  }, [content]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!path) return;
      console.info('[mc:loading] MarkdownDocumentEditor load start', path);
      setLoading(true);
      setLoadedPath(null);
      setError(null);
      try {
        const root = await resolveMarkdownRoot(configuredRoot);
        const nextContent = await markdownFiles.readFile(root, path);
        if (cancelled) {
          console.info('[mc:loading] MarkdownDocumentEditor load cancelled', path);
          return;
        }
        setRootPath(root);
        setContent(nextContent);
        setSavedContent(nextContent);
        setLoadedPath(path);
        setTitleDraft(stemFromPath(path));
        console.info('[mc:loading] MarkdownDocumentEditor load done', {
          path,
          bytes: nextContent.length,
        });
      } catch (err) {
        console.error('[mc:loading] MarkdownDocumentEditor load failed', {
          path,
          err,
        });
        if (!cancelled) {
          setRootPath('');
          setContent('');
          setSavedContent('');
          setLoadedPath(path);
          setTitleDraft(stemFromPath(path));
          setError(String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configuredRoot, path]);

  const save = useCallback(async (snapshot?: string): Promise<boolean> => {
    if (!rootPath || !path) return false;
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }
    const live = snapshot ?? editorRef.current?.getDoc() ?? contentRef.current;
    setSaving(true);
    setError(null);
    const task = (async () => {
      try {
        await markdownFiles.writeFile(rootPath, path, live);
        setSavedContent(live);
        if (contentRef.current === live) {
          setContent(live);
        }
        for (const node of useStore.getState().nodes.filter((n) => n.mdPath === path)) {
          updateNode(node.id, { contentMarkdown: live });
        }
        return true;
      } catch (err) {
        setError(String(err));
        return false;
      }
    })();
    saveInFlightRef.current = task;
    const ok = await task;
    if (saveInFlightRef.current === task) {
      saveInFlightRef.current = null;
      setSaving(false);
    }
    return ok;
  }, [path, rootPath, updateNode]);

  const commitTitle = useCallback(async (opts?: { focusBody?: boolean }) => {
    const focusBody = () => {
      if (opts?.focusBody) {
        window.setTimeout(() => editorRef.current?.focus(), 0);
      }
    };
    if (!rootPath || !path || titleCommitRef.current) {
      focusBody();
      return;
    }
    const nextStem = titleDraft.trim() || 'Untitled';
    const currentStem = stemFromPath(path);
    setTitleDraft(nextStem);
    if (nextStem === currentStem) {
      focusBody();
      return;
    }
    titleCommitRef.current = true;
    setError(null);
    try {
      if (dirty) {
        const ok = await save();
        if (!ok) return;
      }
      const nextPath = await markdownFiles.renamePath(
        rootPath,
        path,
        fileNameFromTitle(nextStem),
      );
      for (const node of useStore.getState().nodes.filter((n) => n.mdPath === path)) {
        updateNode(node.id, {
          mdPath: nextPath,
          title: nextStem,
        });
      }
      window.dispatchEvent(new CustomEvent('mc:knowledge-tree-refresh'));
      window.dispatchEvent(
        new CustomEvent('mc:open-markdown-file', { detail: { path: nextPath } }),
      );
      focusBody();
    } catch (err) {
      setError(String(err));
    } finally {
      titleCommitRef.current = false;
    }
  }, [dirty, path, rootPath, save, titleDraft, updateNode]);

  const requestClose = useCallback(() => {
    void (async () => {
      if (dirty) {
        const ok = await save();
        if (!ok) return;
      }
      onClose();
    })();
  }, [dirty, onClose, save]);

  const handleContentChange = useCallback(
    (next: string) => {
      setContent(next);
    },
    [],
  );

  useEffect(() => {
    if (!markdownAutoSave || !documentReady || !dirty || saving) return;
    const timer = window.setTimeout(() => {
      void save(content);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [content, dirty, documentReady, markdownAutoSave, save, saving]);

  const reveal = useCallback(async () => {
    if (!rootPath) return;
    try {
      await markdownFiles.reveal(rootPath, path);
    } catch (err) {
      setError(String(err));
    }
  }, [path, rootPath]);

  const copyObsidianLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`[[${titleDraft.trim() || titleStem}]]`);
    } catch (err) {
      setError(`Clipboard write failed: ${String(err)}`);
    }
  }, [titleDraft, titleStem]);

  const copyMarkdownPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (err) {
      setError(`Clipboard write failed: ${String(err)}`);
    }
  }, [path]);

  const openInCanvas = useCallback(async () => {
    if (!rootPath) return;
    try {
      const live = editorRef.current?.getDoc() ?? content;
      const state = useStore.getState();
      const conversationId =
        state.settings.lastConversationId ?? state.createConversation('Untitled');
      const recent = state.nodes
        .filter((n) => n.conversationId === conversationId)
        .slice(-1)[0];
      const position = recent
        ? { x: recent.position.x + 320, y: recent.position.y }
        : { x: 240, y: 240 };
      state.addNode({
        conversationId,
        kind: 'markdown',
        title: titleDraft.trim() || titleStem,
        contentMarkdown: live,
        mdPath: path,
        position,
        tags: ['knowledge-base'],
      });
      window.dispatchEvent(
        new CustomEvent('mc:open-markdown-file', { detail: { path: '' } }),
      );
      window.dispatchEvent(
        new CustomEvent('mc:layout-action', { detail: { action: 'show-canvas' } }),
      );
    } catch (err) {
      setError(String(err));
    }
  }, [content, path, rootPath, titleDraft, titleStem]);

  const reimport = useCallback(() => {
    if (!isMirror) {
      setReimportToast('Re-import is only available for mirrored chat files.');
      window.setTimeout(() => setReimportToast(null), 3500);
      return;
    }
    const live = editorRef.current?.getDoc() ?? content;
    const result = reimportMarkdownIntoChat(live);
    if (result.ok) {
      setReimportToast(`Re-imported ${result.messageCount} messages into the chat.`);
    } else {
      setReimportToast(`Re-import failed: ${result.reason}`);
    }
    window.setTimeout(() => setReimportToast(null), 4000);
  }, [content, isMirror]);

  // Register / unregister this editor in the single-slot registry so
  // the command palette and the cross-app keymap can reach it.
  useEffect(() => {
    const view = editorRef.current?.view ?? null;
    if (!view) return;
    return registerEditor({
      view,
      path,
      save: () => void save(),
      close: requestClose,
      toggleMode: setEditorMode,
      isDirty: () => dirty,
      openInCanvas,
    });
  }, [dirty, editorMode, openInCanvas, path, requestClose, save]);

  // Listen for save / close / re-import commands dispatched by
  // useCommands.ts.
  useEffect(() => {
    function onSave() {
      void save();
    }
    function onClose2() {
      requestClose();
    }
    function onCreateNote(e: Event) {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name?.trim();
      if (!name || !rootPath) return;
      const filename = name.endsWith('.md') ? name : `${name}.md`;
      void (async () => {
        try {
          const newPath = await markdownFiles.createFile(rootPath, '', filename);
          window.dispatchEvent(
            new CustomEvent('mc:knowledge-tree-refresh'),
          );
          window.dispatchEvent(
            new CustomEvent('mc:open-markdown-file', { detail: { path: newPath } }),
          );
        } catch (err) {
          setError(String(err));
        }
      })();
    }
    function onReimport() {
      reimport();
    }
    window.addEventListener('mc:editor-save', onSave);
    window.addEventListener('mc:editor-close', onClose2);
    window.addEventListener('mc:create-kb-note', onCreateNote);
    window.addEventListener('mc:editor-reimport', onReimport);
    return () => {
      window.removeEventListener('mc:editor-save', onSave);
      window.removeEventListener('mc:editor-close', onClose2);
      window.removeEventListener('mc:create-kb-note', onCreateNote);
      window.removeEventListener('mc:editor-reimport', onReimport);
    };
  }, [reimport, requestClose, rootPath, save]);

  // When `mc:open-markdown-file` arrives with an anchor and the path is
  // already this file, jump in-place. The App-level handler still fires
  // for new files; this complements it so heading/block links scroll
  // without remounting the editor.
  useEffect(() => {
    function onOpenWithAnchor(e: Event) {
      const detail = (e as CustomEvent<{
        path?: string;
        anchor?: { kind: 'heading'; text: string } | { kind: 'block'; id: string };
      }>).detail;
      if (!detail || detail.path !== path || !detail.anchor) return;
      const live = editorRef.current?.getDoc() ?? content;
      const line = findAnchorLine(live, detail.anchor);
      if (line) editorRef.current?.jumpToLine(line);
    }
    window.addEventListener('mc:open-markdown-file', onOpenWithAnchor);
    return () => window.removeEventListener('mc:open-markdown-file', onOpenWithAnchor);
  }, [content, path]);

  const openInsertPrompt = useCallback(
    (kind: 'link' | 'image') => {
      const view = editorRef.current?.view;
      if (!view) return;
      const sel = view.state.selection.main;
      const selectedText = view.state.sliceDoc(sel.from, sel.to);
      const looksLikeUrl =
        selectedText && /^(https?:|file:|mailto:|tel:|\/)/i.test(selectedText);
      setInsertPrompt({
        kind,
        text: looksLikeUrl ? '' : selectedText,
        url: looksLikeUrl ? selectedText : '',
        range: { from: sel.from, to: sel.to },
      });
    },
    [],
  );

  const commitInsertPrompt = useCallback(() => {
    if (!insertPrompt) return;
    const view = editorRef.current?.view;
    if (!view) {
      setInsertPrompt(null);
      return;
    }
    const url = insertPrompt.url.trim();
    if (!url) {
      setInsertPrompt(null);
      return;
    }
    const text =
      insertPrompt.text.trim() || (insertPrompt.kind === 'image' ? 'image' : url);
    const insert =
      insertPrompt.kind === 'image' ? `![${text}](${url})` : `[${text}](${url})`;
    view.dispatch({
      changes: {
        from: insertPrompt.range.from,
        to: insertPrompt.range.to,
        insert,
      },
      selection: { anchor: insertPrompt.range.from + insert.length },
      userEvent:
        insertPrompt.kind === 'image' ? 'input.insert-image' : 'input.insert-link',
      scrollIntoView: true,
    });
    setInsertPrompt(null);
    window.requestAnimationFrame(() => view.focus());
  }, [insertPrompt]);

  const buildMenuItemsFor = useCallback(
    (
      selectionText: string,
      linkAtCursor: { href: string } | null = null,
    ): EditorContextMenuItem[] => {
      const items: EditorContextMenuItem[] = [
        ...(!markdownAutoSave
          ? [{
              label: 'Save',
              onSelect: () => void save(),
              disabled: !dirty || saving,
            } satisfies EditorContextMenuItem]
          : []),
        { label: 'Close Editor / Return to Canvas', onSelect: requestClose },
      ];
      if (linkAtCursor) {
        const isExternal = /^(https?:|mailto:|file:|tel:)/i.test(
          linkAtCursor.href,
        );
        items.push({ separator: true });
        items.push({
          label: isExternal
            ? `Go to Link → ${truncateForMenu(linkAtCursor.href)}`
            : `Open Link → ${truncateForMenu(linkAtCursor.href)}`,
          onSelect: () =>
            void openMarkdownLinkExternal(linkAtCursor.href, rootPath, path),
        });
        items.push({
          label: 'Copy Link Address',
          onSelect: () => {
            void navigator.clipboard
              .writeText(linkAtCursor.href)
              .catch((err) =>
                setError(`Clipboard write failed: ${String(err)}`),
              );
          },
        });
        items.push({ separator: true });
      }
      items.push(
        { label: 'Reveal in Finder', onSelect: () => void reveal() },
        { label: 'Copy Obsidian Link', onSelect: () => void copyObsidianLink() },
        { label: 'Copy Markdown Path', onSelect: () => void copyMarkdownPath() },
        { label: 'Open in Canvas', onSelect: () => void openInCanvas() },
        { separator: true },
        {
          label: 'Insert Link…',
          onSelect: () => openInsertPrompt('link'),
        },
        {
          label: 'Insert Image…',
          onSelect: () => openInsertPrompt('image'),
        },
      );
      if (isMirror) {
        items.push({ separator: true });
        items.push({
          label: 'Re-import to chat thread…',
          onSelect: reimport,
        });
      }
      items.push({ separator: true });
      if (selectionText) {
        items.push({
          label: 'Ask About Selection',
          onSelect: () => openAiPalette(selectionText, `kb-editor:${path}`),
        });
        items.push({
          label: 'Search Selection',
          onSelect: () => setSearchOpen(true),
        });
      } else {
        // No selection — feed the whole document to the AI palette so the
        // user can ask "summarise this", "explain section X", etc.
        items.push({
          label: 'Ask About This Document',
          onSelect: () => {
            const live = editorRef.current?.getDoc() ?? content;
            openAiPalette(live, `kb-editor:${path}`);
          },
        });
      }
      return items;
    },
    [
      copyMarkdownPath,
      content,
      copyObsidianLink,
      dirty,
      isMirror,
      markdownAutoSave,
      openAiPalette,
      openInCanvas,
      openInsertPrompt,
      path,
      reimport,
      requestClose,
      reveal,
      rootPath,
      save,
      saving,
      setSearchOpen,
    ],
  );

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const view = editorRef.current?.view;
      let selectionText = '';
      let linkAtCursor: { href: string } | null = null;
      if (view) {
        const sel = view.state.selection.main;
        if (!sel.empty) selectionText = view.state.sliceDoc(sel.from, sel.to);
        const pos =
          view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? sel.head;
        const found = findLinkHrefAt(view.state.doc.toString(), pos);
        if (found) linkAtCursor = { href: found.href };
      }
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildMenuItemsFor(selectionText, linkAtCursor),
      });
    },
    [buildMenuItemsFor],
  );

  return (
    <article className="markdown-document">
      <header className="markdown-document-header">
        <div className="markdown-document-meta">
          <div className="markdown-document-breadcrumb">
            {breadcrumb.length > 1
              ? breadcrumb.slice(0, -1).join(' / ')
              : 'Local Markdown'}
          </div>
        </div>
        <div className="markdown-document-actions">
          {onOpenInWindow ? (
            <button
              type="button"
              onClick={onOpenInWindow}
              title="Open Markdown editor in a separate window"
              aria-label="Open Markdown editor in a separate window"
            >
              Window
            </button>
          ) : null}
          <div className="editor-mode-switch" role="group" aria-label="Markdown editor mode">
            {([
              ['live-preview', 'Preview'],
              ['source', 'Code'],
              ['reading', 'Read'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={editorMode === mode ? 'active' : ''}
                onClick={() => setEditorMode(mode)}
                aria-pressed={editorMode === mode}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close Markdown editor"
            title="Close editor (return to canvas)"
          >
            x
          </button>
        </div>
      </header>
      {error ? <div className="markdown-document-error">{error}</div> : null}
      {isMirror ? (
        <div className="knowledge-mirror-banner" role="note">
          This file is mirrored from chat history. Editing the Markdown file
          does not yet update the original chat thread, and the next sync
          will overwrite changes here.
        </div>
      ) : null}
      <div className="markdown-document-surface">
        {showLoading ? (
          <div className="markdown-document-loading">Loading document...</div>
        ) : (
          <div className="markdown-document-split">
            <EditorSidePanel
              doc={content}
              rootPath={rootPath}
              currentPath={path}
              linkedNodeId={linkedNodeId}
              visible={sidePanelVisible}
              onToggle={() => setSidePanelVisible((v) => !v)}
              onJumpToLine={(line) => editorRef.current?.jumpToLine(line)}
              onOpenFile={(p, anchorLine) => {
                window.dispatchEvent(
                  new CustomEvent('mc:open-markdown-file', {
                    detail: anchorLine
                      ? { path: p, anchor: { kind: 'block', id: `__line-${anchorLine}` } }
                      : { path: p },
                  }),
                );
                if (p === path && anchorLine) {
                  editorRef.current?.jumpToLine(anchorLine);
                }
              }}
            />
            <div className="markdown-document-main">
              <input
                className="markdown-document-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitTitle({ focusBody: true });
                  }
                }}
                aria-label="Markdown file title"
                spellCheck={false}
              />
              <PropertiesEditor
                doc={content}
                onChange={handleContentChange}
              />
              {documentReady && editorMode !== 'reading' ? (
                <MarkdownEditorView
                  ref={editorRef}
                  initialDoc={content}
                  filePath={path}
                  rootPath={rootPath}
                  mode={editorMode}
                  onChange={handleContentChange}
                  onSave={() => void save()}
                  onContextMenu={onContextMenu}
                />
              ) : null}
              {documentReady && editorMode === 'reading' ? (
                <div className="markdown-document-reader-host">
                  <KbReadingView source={content} rootPath={rootPath} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <footer className="markdown-document-status">
        <span>{rootPath}</span>
        <span>
          <span className={`markdown-save-state${dirty ? ' dirty' : ''}`}>
            {markdownAutoSave
              ? saving
                ? 'Autosaving...'
                : dirty
                  ? 'Autosave pending'
                  : 'Autosaved'
              : saving
                ? 'Saving...'
                : dirty
                  ? 'Unsaved'
                  : 'Saved'}
          </span>
          {' · '}
          {stats.words} words / {stats.chars} chars
        </span>
      </footer>
      {menu ? (
        <EditorContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {reimportToast ? (
        <div className="editor-toast" role="status">
          {reimportToast}
        </div>
      ) : null}
      {insertPrompt ? (
        <div
          className="modal-backdrop"
          onClick={() => setInsertPrompt(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="modal markdown-insert-prompt"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>
                {insertPrompt.kind === 'image' ? 'Insert Image' : 'Insert Link'}
              </h2>
              <button
                type="button"
                onClick={() => setInsertPrompt(null)}
                aria-label="Cancel"
              >
                ×
              </button>
            </header>
            <label>
              <span>{insertPrompt.kind === 'image' ? 'Alt text' : 'Link text'}</span>
              <input
                type="text"
                value={insertPrompt.text}
                placeholder={
                  insertPrompt.kind === 'image' ? 'image' : 'visible text'
                }
                onChange={(e) =>
                  setInsertPrompt((cur) =>
                    cur ? { ...cur, text: e.target.value } : cur,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInsertPrompt();
                  } else if (e.key === 'Escape') {
                    setInsertPrompt(null);
                  }
                }}
              />
            </label>
            <label>
              <span>URL</span>
              <input
                autoFocus
                type="text"
                value={insertPrompt.url}
                placeholder="https://… or /local/path"
                onChange={(e) =>
                  setInsertPrompt((cur) =>
                    cur ? { ...cur, url: e.target.value } : cur,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInsertPrompt();
                  } else if (e.key === 'Escape') {
                    setInsertPrompt(null);
                  }
                }}
              />
            </label>
            <div className="markdown-insert-prompt-actions">
              <button type="button" onClick={() => setInsertPrompt(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={commitInsertPrompt}
                disabled={!insertPrompt.url.trim()}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

// `resolveKbWikilinkTarget` is re-exported for the editor commands that
// resolve the link under the cursor. Keeping the import alive here means
// the commands module does not need to know about wikilink internals.
void resolveKbWikilinkTarget;
