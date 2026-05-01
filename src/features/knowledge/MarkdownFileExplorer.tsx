import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDangerTwice } from '../../lib/confirm';
import { useStore } from '../../store';
import {
  markdownFiles,
  resolveMarkdownRoot,
  type MarkdownTreeNode,
} from '../../services/storage/MarkdownFileService';
import { searchMarkdownFiles, type MarkdownSearchResult } from '../../services/markdown/MarkdownSearchService';
import { isMirroredFile } from '../../services/knowledge/conversationMarkdownMirror';
import { dialog } from '../../services/dialog';
import { validateMarkdownStorageDir } from '../../services/export/markdownStorage';

type MenuTarget =
  | { node: MarkdownTreeNode; x: number; y: number }
  | { node: null; x: number; y: number };

// Mirror confirmation cheat: only files matching this pattern under the
// current chat-history layout (or the legacy Chats/Projects layout) are
// candidates for the chat badge. We then confirm by reading frontmatter and
// checking `source: internal-chat`. The pattern check keeps the scan bounded.
const MIRROR_FILENAME_PATTERN = /--[A-Za-z0-9_-]{6,}\.md$/i;
function isMirrorCandidate(node: MarkdownTreeNode): boolean {
  if (node.kind !== 'file') return false;
  if (!MIRROR_FILENAME_PATTERN.test(node.name)) return false;
  return (
    node.path.startsWith('default/chat-history/') ||
    node.path.startsWith('chat-history/') ||
    node.path.startsWith('projects/') ||
    node.path.startsWith('Chats/') ||
    node.path.startsWith('Projects/')
  );
}

function obsidianLinkFor(node: MarkdownTreeNode): string {
  const stem = node.name.replace(/\.md$/i, '');
  return `[[${stem}]]`;
}

const ASK_TRUNCATE_BYTES = 64 * 1024;
const TOAST_DURATION_MS = 4000;

type ToastTone = 'info' | 'error';
type Toast = { id: number; tone: ToastTone; message: string };
let toastSeq = 0;

export function MarkdownFileExplorer({
  activePath,
  onOpenFile,
}: {
  activePath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const configuredRoot = useStore((s) => s.settings.markdownStorageDir);
  const setMarkdownStorageDir = useStore((s) => s.setMarkdownStorageDir);
  const [rootPath, setRootPath] = useState('');
  const [tree, setTree] = useState<MarkdownTreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [contentMatches, setContentMatches] = useState<MarkdownSearchResult[]>([]);
  const [contentSearching, setContentSearching] = useState(false);
  const [mirrorPaths, setMirrorPaths] = useState<Set<string>>(() => new Set());
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rootName = useMemo(() => {
    if (!rootPath) return 'Local Markdown';
    const parts = rootPath.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'Local Markdown';
  }, [rootPath]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const root = await resolveMarkdownRoot(configuredRoot);
      const nextTree = await markdownFiles.listTree(root);
      setRootPath(root);
      setTree(nextTree);
      setExpanded((cur) => new Set(cur).add(''));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [configuredRoot]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const showToast = useCallback((tone: ToastTone, message: string) => {
    toastSeq += 1;
    setToast({ id: toastSeq, tone, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = window.setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onTreeRefresh() {
      void refresh();
    }
    function onSyncEvent(e: Event) {
      const detail = (e as CustomEvent<{
        error?: string;
        written?: number;
        skipped?: number;
        errors?: { conversationId: string; reason: string }[];
      }>).detail;
      setSyncing(false);
      if (!detail) return;
      if (detail.error) {
        showToast('error', `Knowledge Base sync failed: ${detail.error}`);
        return;
      }
      // Per-item errors used to surface as a noisy red toast on every
      // sync — typically caused by harmless leftovers (a stale file
      // from an earlier mirror layout, or a user-edited file without
      // `source: internal-chat` frontmatter that we refuse to touch).
      // The full per-item details land in the devtools console via
      // `console.error` from `persistence.ts`, so the toast is gone.
      if ((detail.written ?? 0) > 0) {
        showToast(
          'info',
          `Mirrored ${detail.written} conversation${detail.written === 1 ? '' : 's'}.`,
        );
      }
    }
    window.addEventListener('mc:knowledge-tree-refresh', onTreeRefresh);
    window.addEventListener('mc:knowledge-sync', onSyncEvent);
    return () => {
      window.removeEventListener('mc:knowledge-tree-refresh', onTreeRefresh);
      window.removeEventListener('mc:knowledge-sync', onSyncEvent);
    };
  }, [refresh, showToast]);

  // Confirm which candidate files are actually chat mirrors by reading
  // their frontmatter. We bound the scan to filename / location candidates
  // (see `isMirrorCandidate`) so the IO cost stays linear in the number of
  // mirror files, not in the total vault size.
  useEffect(() => {
    if (!tree || !rootPath) return;
    let cancelled = false;
    const candidates: MarkdownTreeNode[] = [];
    function walk(node: MarkdownTreeNode) {
      if (isMirrorCandidate(node)) candidates.push(node);
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree);
    (async () => {
      const confirmed = new Set<string>();
      for (const node of candidates) {
        if (cancelled) return;
        try {
          const content = await markdownFiles.readFile(rootPath, node.path);
          if (isMirroredFile(content)) confirmed.add(node.path);
        } catch {
          // Unreadable — skip rather than fail the whole pass.
        }
      }
      if (!cancelled) setMirrorPaths(confirmed);
    })();
    return () => {
      cancelled = true;
    };
  }, [rootPath, tree]);

  const triggerSync = useCallback(() => {
    setSyncing(true);
    showToast('info', 'Syncing chat history…');
    window.dispatchEvent(new CustomEvent('mc:knowledge-sync-request'));
  }, [showToast]);

  const chooseWorkingFolder = useCallback(async () => {
    setError(null);
    try {
      const picked = await dialog.pickFolder();
      if (!picked) return;
      const check = await validateMarkdownStorageDir(picked);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      setLoading(true);
      const nextTree = await markdownFiles.listTree(picked);
      setMarkdownStorageDir(picked);
      setRootPath(picked);
      setTree(nextTree);
      setExpanded((cur) => new Set(cur).add(''));
      showToast('info', 'Working folder changed.');
      window.dispatchEvent(new CustomEvent('mc:knowledge-sync-request'));
    } catch (err) {
      setError(`Could not choose working folder: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [setMarkdownStorageDir, showToast]);

  useEffect(() => {
    function onChooseFolder() {
      void chooseWorkingFolder();
    }
    window.addEventListener('mc:knowledge-choose-folder', onChooseFolder);
    return () =>
      window.removeEventListener('mc:knowledge-choose-folder', onChooseFolder);
  }, [chooseWorkingFolder]);

  // Debounced content search. Filename / path filtering is synchronous and
  // happens at render time against the already-loaded tree.
  useEffect(() => {
    const q = query.trim();
    if (!rootPath) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!q) {
        if (!cancelled) {
          setContentMatches([]);
          setContentSearching(false);
        }
        return;
      }
      setContentSearching(true);
      try {
        const results = await searchMarkdownFiles({
          query: q,
          scope: 'all',
          selectedNodeIds: [],
          markdownStorageDir: configuredRoot,
        });
        if (!cancelled) setContentMatches(results);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setContentSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [configuredRoot, query, rootPath]);

  useEffect(() => {
    if (!menu) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [menu]);

  const createNote = useCallback(
    async (parentPath: string) => {
      const name = window.prompt('New note name', 'Untitled.md');
      if (!name || !rootPath) return;
      try {
        const path = await markdownFiles.createFile(rootPath, parentPath, name);
        setExpanded((cur) => new Set(cur).add(parentPath));
        await refresh();
        onOpenFile(path);
      } catch (err) {
        setError(String(err));
      }
    },
    [onOpenFile, refresh, rootPath],
  );

  const createFolder = useCallback(
    async (parentPath: string) => {
      const name = window.prompt('New folder name', 'New Folder');
      if (!name || !rootPath) return;
      try {
        const path = await markdownFiles.createFolder(rootPath, parentPath, name);
        setExpanded((cur) => new Set(cur).add(parentPath).add(path));
        await refresh();
      } catch (err) {
        setError(String(err));
      }
    },
    [refresh, rootPath],
  );

  const renameNode = useCallback(
    async (node: MarkdownTreeNode) => {
      const next = window.prompt('Rename', node.name);
      if (!next || !rootPath) return;
      try {
        const nextPath = await markdownFiles.renamePath(rootPath, node.path, next);
        await refresh();
        if (node.kind === 'file' && activePath === node.path) onOpenFile(nextPath);
      } catch (err) {
        setError(String(err));
      }
    },
    [activePath, onOpenFile, refresh, rootPath],
  );

  const deleteNode = useCallback(
    async (node: MarkdownTreeNode) => {
      if (!rootPath) return;
      const detail =
        node.kind === 'folder'
          ? 'This deletes the folder and all Markdown files inside it.'
          : 'This deletes the Markdown file from disk.';
      if (
        !confirmDangerTwice({
          title: `Delete "${node.name}"?`,
          detail,
          finalDetail: 'Second confirmation: permanently delete this from the local Markdown folder?',
        })
      ) {
        return;
      }
      try {
        await markdownFiles.deletePath(rootPath, node.path);
        await refresh();
        if (activePath === node.path) onOpenFile('');
      } catch (err) {
        setError(String(err));
      }
    },
    [activePath, onOpenFile, refresh, rootPath],
  );

  const reveal = useCallback(
    async (path: string) => {
      if (!rootPath) return;
      try {
        await markdownFiles.reveal(rootPath, path);
      } catch (err) {
        setError(String(err));
      }
    },
    [rootPath],
  );

  const openInCanvas = useCallback(
    async (node: MarkdownTreeNode) => {
      if (!rootPath || node.kind !== 'file') return;
      try {
        const content = await markdownFiles.readFile(rootPath, node.path);
        const state = useStore.getState();
        const conversationId =
          state.settings.lastConversationId ?? state.createConversation('Untitled');
        const titleFromName = node.name.replace(/\.md$/i, '');
        const recent = state.nodes
          .filter((n) => n.conversationId === conversationId)
          .slice(-1)[0];
        const position = recent
          ? { x: recent.position.x + 320, y: recent.position.y }
          : { x: 240, y: 240 };
        state.addNode({
          conversationId,
          kind: 'markdown',
          title: titleFromName,
          contentMarkdown: content,
          mdPath: node.path,
          position,
          tags: ['knowledge-base'],
        });
        // Switch the workspace to canvas + clear the open Markdown editor.
        window.dispatchEvent(
          new CustomEvent('mc:open-markdown-file', { detail: { path: '' } }),
        );
        window.dispatchEvent(
          new CustomEvent('mc:layout-action', { detail: { action: 'show-canvas' } }),
        );
      } catch (err) {
        setError(String(err));
      }
    },
    [rootPath],
  );

  const askWithFile = useCallback(
    async (node: MarkdownTreeNode) => {
      if (!rootPath || node.kind !== 'file') return;
      try {
        let content = await markdownFiles.readFile(rootPath, node.path);
        if (content.length > ASK_TRUNCATE_BYTES) {
          content = `${content.slice(0, ASK_TRUNCATE_BYTES)}\n\n...[truncated]`;
        }
        useStore
          .getState()
          .openAiPalette(content, `kb-file:${node.path}`);
      } catch (err) {
        setError(String(err));
      }
    },
    [rootPath],
  );

  const copyObsidianLink = useCallback(async (node: MarkdownTreeNode) => {
    try {
      await navigator.clipboard.writeText(obsidianLinkFor(node));
    } catch (err) {
      setError(`Clipboard write failed: ${String(err)}`);
    }
  }, []);

  function toggleFolder(path: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const filterText = query.trim().toLowerCase();
  const filenameMatches = useMemo(() => {
    if (!filterText || !tree) return null;
    const out: MarkdownTreeNode[] = [];
    function walk(node: MarkdownTreeNode) {
      if (node.kind === 'file') {
        const hay = `${node.name} ${node.path}`.toLowerCase();
        if (hay.includes(filterText)) out.push(node);
      }
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree);
    return out;
  }, [filterText, tree]);

  const mergedSearchResults = useMemo(() => {
    if (!filterText) return null;
    const seen = new Set<string>();
    const merged: { node: MarkdownTreeNode; snippet?: string }[] = [];
    for (const node of filenameMatches ?? []) {
      if (seen.has(node.path)) continue;
      seen.add(node.path);
      merged.push({ node });
    }
    for (const r of contentMatches) {
      if (seen.has(r.path)) {
        // attach snippet to the existing entry if not present
        const entry = merged.find((m) => m.node.path === r.path);
        if (entry && !entry.snippet) entry.snippet = r.snippet;
        continue;
      }
      seen.add(r.path);
      const fileName = r.path.split('/').pop() ?? r.path;
      merged.push({
        node: { kind: 'file', name: fileName, path: r.path },
        snippet: r.snippet,
      });
    }
    return merged;
  }, [contentMatches, filenameMatches, filterText]);

  const menuNode = menu?.node ?? null;
  const menuParent =
    menuNode?.kind === 'folder' ? menuNode.path : menuNode?.path.split('/').slice(0, -1).join('/') ?? '';
  const revealTarget = selectedPath ?? activePath ?? '';

  return (
    <div
      className="knowledge-section"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ node: null, x: e.clientX, y: e.clientY });
      }}
    >
      <div className="knowledge-header">
        <div className="knowledge-title">
          <span>Knowledge Base</span>
          <small title={rootPath}>{rootName}</small>
        </div>
        <div className="knowledge-actions">
          <button type="button" onClick={() => void createNote('')} title="New note" aria-label="New note">
            +
          </button>
          <button type="button" onClick={() => void createFolder('')} title="New folder" aria-label="New folder">
            []
          </button>
          <button type="button" onClick={() => void refresh()} title="Refresh" aria-label="Refresh">
            R
          </button>
          <button
            type="button"
            onClick={triggerSync}
            disabled={syncing}
            title="Sync chat history into Markdown"
            aria-label="Sync chat history into Markdown"
          >
            {syncing ? '…' : '↻'}
          </button>
          <button
            type="button"
            onClick={() => void reveal(revealTarget)}
            title="Reveal in Finder"
            aria-label="Reveal in Finder"
          >
            ↗
          </button>
        </div>
      </div>
      <div className="knowledge-search">
        <input
          type="search"
          value={query}
          placeholder="Search notes & chats..."
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search Knowledge Base"
        />
        {filterText && (filenameMatches?.length ?? 0) + contentMatches.length === 0 && !contentSearching ? (
          <div className="knowledge-search-status">No matches</div>
        ) : null}
        {contentSearching ? <div className="knowledge-search-status">Searching contents…</div> : null}
      </div>
      {error ? <div className="knowledge-error">{error}</div> : null}
      <div className="knowledge-tree">
        {loading && !tree ? (
          <div className="sidebar-empty">Loading Markdown files...</div>
        ) : mergedSearchResults ? (
          <div className="knowledge-search-results">
            {mergedSearchResults.length === 0 ? (
              <div className="sidebar-empty">No matches.</div>
            ) : (
              mergedSearchResults.map(({ node, snippet }) => (
                <button
                  key={`search:${node.path}`}
                  type="button"
                  className={`knowledge-search-result${
                    activePath === node.path ? ' active' : ''
                  }`}
                  onClick={() => {
                    setSelectedPath(node.path);
                    onOpenFile(node.path);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedPath(node.path);
                    setMenu({ node, x: e.clientX, y: e.clientY });
                  }}
                  title={node.path}
                >
                  <span className="knowledge-search-result-name">
                    {node.name}
                    {mirrorPaths.has(node.path) ? (
                      <span className="knowledge-mirror-badge" title="Mirrored from chat history">
                        chat
                      </span>
                    ) : null}
                  </span>
                  <span className="knowledge-search-result-path">{node.path}</span>
                  {snippet ? (
                    <span className="knowledge-search-result-snippet">{snippet}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        ) : tree ? (
          <TreeNodeRow
            node={{ ...tree, name: rootName }}
            depth={0}
            expanded={expanded}
            activePath={activePath}
            mirrorPaths={mirrorPaths}
            onToggle={toggleFolder}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onOpenFile={(path) => {
              setSelectedPath(path);
              onOpenFile(path);
            }}
            onContextMenu={(node, x, y) => {
              setSelectedPath(node.path);
              setMenu({ node, x, y });
            }}
          />
        ) : (
          <div className="sidebar-empty">No Markdown folder yet.</div>
        )}
      </div>
      {toast ? (
        <div className={`knowledge-toast knowledge-toast-${toast.tone}`} role="status">
          {toast.message}
        </div>
      ) : null}
      {menu ? (
        <div
          ref={menuRef}
          className="knowledge-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {menuNode?.kind === 'file' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  onOpenFile(menuNode.path);
                }}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  void openInCanvas(menuNode);
                }}
              >
                Open in Canvas
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  void askWithFile(menuNode);
                }}
              >
                Ask with this file
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  void copyObsidianLink(menuNode);
                }}
              >
                Copy Obsidian Link
              </button>
            </>
          ) : null}
          {menuNode?.kind !== 'file' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  void createNote(menuParent);
                }}
              >
                New Note
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  void createFolder(menuParent);
                }}
              >
                New Folder
              </button>
            </>
          ) : null}
          {menuNode ? (
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                void renameNode(menuNode);
              }}
            >
              Rename
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              void reveal(menuNode?.path ?? '');
            }}
          >
            {menuNode ? 'Reveal in Finder' : 'Reveal Root in Finder'}
          </button>
          {!menuNode ? (
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                void refresh();
              }}
            >
              Refresh
            </button>
          ) : null}
          {menuNode ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenu(null);
                void deleteNode(menuNode);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  activePath,
  mirrorPaths,
  onToggle,
  onOpenFile,
  onContextMenu,
  selectedPath,
  onSelect,
}: {
  node: MarkdownTreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  mirrorPaths: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onContextMenu: (node: MarkdownTreeNode, x: number, y: number) => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const isFolder = node.kind === 'folder';
  const isExpanded = expanded.has(node.path);
  const isActive = (!isFolder && activePath === node.path) || selectedPath === node.path;
  const isMirror = !isFolder && mirrorPaths.has(node.path);
  return (
    <div className="knowledge-node">
      <button
        type="button"
        className={`knowledge-row${isActive ? ' active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        title={node.path || node.name}
        onClick={() => {
          onSelect(node.path);
          if (isFolder) onToggle(node.path);
          else onOpenFile(node.path);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(node, e.clientX, e.clientY);
        }}
      >
        <span className="knowledge-caret">{isFolder ? (isExpanded ? 'v' : '>') : ''}</span>
        <span className="knowledge-icon">{isFolder ? 'dir' : 'md'}</span>
        <span className="knowledge-name">
          {node.name}
          {isMirror ? (
            <span className="knowledge-mirror-badge" title="Mirrored from chat history">
              chat
            </span>
          ) : null}
        </span>
      </button>
      {isFolder && isExpanded
        ? (node.children ?? []).map((child) => (
            <TreeNodeRow
              key={`${child.kind}:${child.path}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              mirrorPaths={mirrorPaths}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}
