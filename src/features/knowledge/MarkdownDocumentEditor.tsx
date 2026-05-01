import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import {
  markdownFiles,
  resolveMarkdownRoot,
} from '../../services/storage/MarkdownFileService';
import { isMirroredFile } from '../../services/knowledge/conversationMarkdownMirror';
import type { EditorMode } from '../../types';
import { MarkdownEditorView, type MarkdownEditorViewHandle } from './editor/MarkdownEditorView';
import { KbReadingView } from './editor/KbReadingView';
import { EditorContextMenu } from './editor/EditorContextMenu';
import type { EditorContextMenuItem } from './editor/EditorContextMenu';
import { registerEditor } from './editor/editorRegistry';
import { resolveKbWikilinkTarget } from './editor/extensions/wikilink';
import { EditorSidePanel } from './editor/EditorSidePanel';
import { PropertiesEditor } from './editor/PropertiesEditor';
import { findAnchorLine } from './editor/sidePanel';
import { reimportMarkdownIntoChat } from '../../services/knowledge/conversationMarkdownReimport';

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
  const editorMode = useStore<EditorMode>(
    (s) => s.settings.editorMode ?? 'live-preview',
  );
  const setEditorMode = useStore((s) => s.setEditorMode);
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
  const [sidePanelVisible, setSidePanelVisible] = useState(true);
  const [reimportToast, setReimportToast] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorViewHandle | null>(null);
  const contentRef = useRef('');
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);

  const dirty = content !== savedContent;
  const documentReady = loadedPath === path && !loading && !error && rootPath;
  const showLoading = !error && (loading || loadedPath !== path);
  const isMirror = useMemo(() => isMirroredFile(savedContent), [savedContent]);
  const title = useMemo(() => {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'Untitled.md';
  }, [path]);
  const breadcrumb = useMemo(() => path.split('/').filter(Boolean), [path]);
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
      setLoading(true);
      setLoadedPath(null);
      setError(null);
      try {
        const root = await resolveMarkdownRoot(configuredRoot);
        const nextContent = await markdownFiles.readFile(root, path);
        if (cancelled) return;
        setRootPath(root);
        setContent(nextContent);
        setSavedContent(nextContent);
        setLoadedPath(path);
      } catch (err) {
        if (!cancelled) {
          setRootPath('');
          setContent('');
          setSavedContent('');
          setLoadedPath(path);
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
    if (!documentReady || !dirty || saving) return;
    const timer = window.setTimeout(() => {
      void save(content);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [content, dirty, documentReady, save, saving]);

  const reveal = useCallback(async () => {
    if (!rootPath) return;
    try {
      await markdownFiles.reveal(rootPath, path);
    } catch (err) {
      setError(String(err));
    }
  }, [path, rootPath]);

  const copyObsidianLink = useCallback(async () => {
    const stem = title.replace(/\.md$/i, '');
    try {
      await navigator.clipboard.writeText(`[[${stem}]]`);
    } catch (err) {
      setError(`Clipboard write failed: ${String(err)}`);
    }
  }, [title]);

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
        title: title.replace(/\.md$/i, ''),
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
  }, [content, path, rootPath, title]);

  const setMode = useCallback(
    (mode: EditorMode) => {
      setEditorMode(mode);
    },
    [setEditorMode],
  );

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
      toggleMode: setMode,
      isDirty: () => dirty,
      openInCanvas,
    });
  }, [dirty, openInCanvas, path, requestClose, save, setMode]);

  // Listen for the mode-toggle / save / close commands dispatched by
  // useCommands.ts. Keeping the wiring here means the editor stays in
  // charge of its own dirty-state semantics.
  useEffect(() => {
    function onSave() {
      void save();
    }
    function onClose2() {
      requestClose();
    }
    function onToggleMode(e: Event) {
      const detail = (e as CustomEvent<{ mode?: EditorMode }>).detail;
      if (detail?.mode) setMode(detail.mode);
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
    window.addEventListener('mc:editor-toggle-mode', onToggleMode);
    window.addEventListener('mc:create-kb-note', onCreateNote);
    window.addEventListener('mc:editor-reimport', onReimport);
    return () => {
      window.removeEventListener('mc:editor-save', onSave);
      window.removeEventListener('mc:editor-close', onClose2);
      window.removeEventListener('mc:editor-toggle-mode', onToggleMode);
      window.removeEventListener('mc:create-kb-note', onCreateNote);
      window.removeEventListener('mc:editor-reimport', onReimport);
    };
  }, [reimport, requestClose, rootPath, save, setMode]);

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

  const buildMenuItemsFor = useCallback(
    (selectionText: string): EditorContextMenuItem[] => {
      const items: EditorContextMenuItem[] = [
        { label: 'Close Editor / Return to Canvas', onSelect: requestClose },
        { label: 'Reveal in Finder', onSelect: () => void reveal() },
        { label: 'Copy Obsidian Link', onSelect: () => void copyObsidianLink() },
        { label: 'Copy Markdown Path', onSelect: () => void copyMarkdownPath() },
        { label: 'Open in Canvas', onSelect: () => void openInCanvas() },
        {
          label: editorMode === 'reading' ? 'Exit Reading View' : 'Toggle Reading View',
          onSelect: () => setMode(editorMode === 'reading' ? 'live-preview' : 'reading'),
        },
        {
          label: editorMode === 'source' ? 'Exit Source Mode' : 'Toggle Source Mode',
          onSelect: () => setMode(editorMode === 'source' ? 'live-preview' : 'source'),
        },
      ];
      if (isMirror) {
        items.push({ separator: true });
        items.push({
          label: 'Re-import to chat thread…',
          onSelect: reimport,
        });
      }
      if (selectionText) {
        items.push({ separator: true });
        items.push({
          label: 'Ask About Selection',
          onSelect: () => openAiPalette(selectionText, `kb-editor:${path}`),
        });
        items.push({
          label: 'Search Selection',
          onSelect: () => setSearchOpen(true),
        });
      }
      return items;
    },
    [
      copyMarkdownPath,
      copyObsidianLink,
      editorMode,
      isMirror,
      openAiPalette,
      openInCanvas,
      path,
      reimport,
      requestClose,
      reveal,
      setMode,
      setSearchOpen,
    ],
  );

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const view = editorRef.current?.view;
      let selectionText = '';
      if (view) {
        const sel = view.state.selection.main;
        if (!sel.empty) selectionText = view.state.sliceDoc(sel.from, sel.to);
      }
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildMenuItemsFor(selectionText),
      });
    },
    [buildMenuItemsFor],
  );

  const onReadingContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const selectionText = window.getSelection()?.toString() ?? '';
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildMenuItemsFor(selectionText),
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
          <h1>{title}</h1>
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
          <label className="editor-mode-select" title="Editor mode">
            <span className="sr-only">Editor mode</span>
            <select
              value={editorMode}
              onChange={(e) => setMode(e.target.value as EditorMode)}
              aria-label="Editor mode"
            >
              <option value="live-preview">Live preview</option>
              <option value="source">Source</option>
              <option value="reading">Read</option>
            </select>
          </label>
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
            <div className="markdown-document-main">
              {editorMode !== 'source' ? (
                <PropertiesEditor
                  doc={content}
                  onChange={handleContentChange}
                />
              ) : null}
              {editorMode === 'reading' && documentReady ? (
                <div onContextMenu={onReadingContextMenu} className="markdown-document-reader-host">
                  <KbReadingView source={content} rootPath={rootPath} />
                </div>
              ) : documentReady ? (
                <MarkdownEditorView
                  ref={editorRef}
                  initialDoc={content}
                  filePath={path}
                  rootPath={rootPath}
                  mode={editorMode === 'source' ? 'source' : 'live-preview'}
                  onChange={handleContentChange}
                  onSave={() => void save()}
                  onContextMenu={onContextMenu}
                />
              ) : null}
            </div>
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
          </div>
        )}
      </div>
      <footer className="markdown-document-status">
        <span>{rootPath}</span>
        <span>
          <span className={`markdown-save-state${dirty ? ' dirty' : ''}`}>
            {saving ? 'Autosaving...' : dirty ? 'Autosave pending' : 'Autosaved'}
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
    </article>
  );
}

// `resolveKbWikilinkTarget` is re-exported for the editor commands that
// resolve the link under the cursor. Keeping the import alive here means
// the commands module does not need to know about wikilink internals.
void resolveKbWikilinkTarget;
