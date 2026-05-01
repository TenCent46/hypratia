import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import {
  markdownFiles,
  resolveMarkdownRoot,
  tryReadMarkdownFile,
  writeMarkdownFileEnsuringDirs,
  type MarkdownTreeNode,
} from '../../services/storage/MarkdownFileService';
import {
  defaultInstructionPath,
  defaultMemoryPath,
  legacyProjectInstructionPath,
  legacyProjectMemoryPath,
  projectBasePath,
  projectInstructionPath,
  projectMemoryPath,
  PROJECT_RAW_DIR,
  ROOT_RAW_DIR,
} from '../../services/knowledge/knowledgeBaseLayout';
import type { Project } from '../../types';

type Tab = 'instruction' | 'memory' | 'files';

const TABS: { id: Tab; label: string }[] = [
  { id: 'instruction', label: 'Instructions' },
  { id: 'memory', label: 'Memory' },
  { id: 'files', label: 'Files' },
];

export function WorkspaceConfigModal() {
  const open = useStore((s) => s.ui.workspaceConfigOpen);
  if (!open) return null;
  return <Inner />;
}

function Inner() {
  const setOpen = useStore((s) => s.setWorkspaceConfigOpen);
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const conversation = useStore((s) =>
    conversationId
      ? s.conversations.find((c) => c.id === conversationId) ?? null
      : null,
  );
  const project: Project | null = useStore((s) =>
    conversation?.projectId
      ? s.projects.find((p) => p.id === conversation.projectId) ?? null
      : null,
  );
  const workspaceName = useStore((s) => s.settings.workspaceName);

  const scopeLabel = project ? project.name : 'Default workspace';
  const headingScope = project
    ? `Project · ${project.name}`
    : workspaceName?.trim()
      ? `Workspace · ${workspaceName}`
      : 'Default workspace';

  const paths = useMemo(() => buildPaths(project), [project]);

  const [tab, setTab] = useState<Tab>('instruction');
  const [instruction, setInstruction] = useState('');
  const [memory, setMemory] = useState('');
  const [originalInstruction, setOriginalInstruction] = useState('');
  const [originalMemory, setOriginalMemory] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'instruction' | 'memory' | null>(null);
  const [savedAt, setSavedAt] = useState<{
    instruction?: number;
    memory?: number;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState('');
  const [rawTree, setRawTree] = useState<MarkdownTreeNode | null>(null);
  const [rawTreeLoading, setRawTreeLoading] = useState(false);

  const dirtyInstruction = instruction !== originalInstruction;
  const dirtyMemory = memory !== originalMemory;

  // Load instruction.md / memory.md (with the legacy fallback path) when
  // the modal opens or scope changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const root = await resolveMarkdownRoot(
          useStore.getState().settings.markdownStorageDir,
        );
        if (cancelled) return;
        setRootPath(root);
        const [ins, mem] = await Promise.all([
          readWithFallback(
            root,
            paths.instruction,
            paths.legacyInstruction,
          ),
          readWithFallback(root, paths.memory, paths.legacyMemory),
        ]);
        if (cancelled) return;
        const insStr = ins ?? '';
        const memStr = mem ?? '';
        setInstruction(insStr);
        setMemory(memStr);
        setOriginalInstruction(insStr);
        setOriginalMemory(memStr);
        setSavedAt({});
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paths.instruction, paths.memory, paths.legacyInstruction, paths.legacyMemory]);

  // Files tab: walk the project (or default) `raw/` folder for a file
  // listing. Refreshed each time the user opens the tab.
  useEffect(() => {
    if (tab !== 'files') return;
    if (!rootPath) return;
    let cancelled = false;
    (async () => {
      setRawTreeLoading(true);
      try {
        const tree = await markdownFiles.listTree(rootPath);
        if (cancelled) return;
        setRawTree(tree);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setRawTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, rootPath]);

  async function saveInstruction() {
    if (!rootPath) return;
    setSaving('instruction');
    setError(null);
    try {
      await writeMarkdownFileEnsuringDirs(rootPath, paths.instruction, instruction);
      setOriginalInstruction(instruction);
      setSavedAt((s) => ({ ...s, instruction: Date.now() }));
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveMemory() {
    if (!rootPath) return;
    setSaving('memory');
    setError(null);
    try {
      await writeMarkdownFileEnsuringDirs(rootPath, paths.memory, memory);
      setOriginalMemory(memory);
      setSavedAt((s) => ({ ...s, memory: Date.now() }));
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(null);
    }
  }

  async function onAddFiles(files: File[]) {
    if (!rootPath) return;
    setError(null);
    for (const file of files) {
      const safeName = file.name.replace(/[/\\]/g, '_');
      const target = `${paths.rawDir}/${safeName}`;
      try {
        const text = await file.text();
        await writeMarkdownFileEnsuringDirs(rootPath, target, text);
      } catch (err) {
        setError(`Failed to save ${file.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    // Refresh the tree to pick up the new files.
    try {
      const tree = await markdownFiles.listTree(rootPath);
      setRawTree(tree);
    } catch {
      // ignore
    }
  }

  function close() {
    if (dirtyInstruction || dirtyMemory) {
      if (!window.confirm('You have unsaved changes. Close anyway?')) return;
    }
    setOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal workspace-config-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <h2>Configure {scopeLabel}</h2>
            <p className="muted">{headingScope}</p>
          </div>
          <button
            type="button"
            className="close"
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <nav className="workspace-config-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`workspace-config-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'instruction' && dirtyInstruction ? ' •' : ''}
              {t.id === 'memory' && dirtyMemory ? ' •' : ''}
            </button>
          ))}
        </nav>

        {tab === 'instruction' ? (
          <Editor
            label="instruction.md"
            description="Loaded into the system prompt before every chat send for this scope. Use it for ground rules, persona, formatting preferences."
            path={paths.instruction}
            value={instruction}
            originalValue={originalInstruction}
            onChange={setInstruction}
            loading={loading}
            saving={saving === 'instruction'}
            savedAt={savedAt.instruction}
            dirty={dirtyInstruction}
            onSave={saveInstruction}
          />
        ) : null}
        {tab === 'memory' ? (
          <Editor
            label="memory.md"
            description="Long-running context the assistant should always remember (decisions, key facts, in-flight projects). Also loaded before every send."
            path={paths.memory}
            value={memory}
            originalValue={originalMemory}
            onChange={setMemory}
            loading={loading}
            saving={saving === 'memory'}
            savedAt={savedAt.memory}
            dirty={dirtyMemory}
            onSave={saveMemory}
          />
        ) : null}
        {tab === 'files' ? (
          <FilesPane
            rootPath={rootPath}
            rawDir={paths.rawDir}
            tree={rawTree}
            loading={rawTreeLoading}
            onAddFiles={onAddFiles}
          />
        ) : null}

        {error ? <div className="canvas-modal-error">{error}</div> : null}
      </div>
    </div>
  );
}

function Editor({
  label,
  description,
  path,
  value,
  onChange,
  loading,
  saving,
  savedAt,
  dirty,
  onSave,
}: {
  label: string;
  description: string;
  path: string;
  value: string;
  originalValue: string;
  onChange: (next: string) => void;
  loading: boolean;
  saving: boolean;
  savedAt?: number;
  dirty: boolean;
  onSave: () => void;
}) {
  const status = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : savedAt
        ? `Saved ${formatRelative(savedAt)}`
        : 'No changes';
  return (
    <div className="workspace-config-pane">
      <div className="workspace-config-meta">
        <strong>{label}</strong>
        <span className="muted small"> · {path}</span>
      </div>
      <p className="muted small">{description}</p>
      <textarea
        className="workspace-config-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        spellCheck={false}
        placeholder={loading ? 'Loading…' : 'Empty'}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <footer className="workspace-config-footer">
        <span className="muted small">{status} · ⌘S to save</span>
        <button
          type="button"
          className="primary"
          disabled={loading || saving || !dirty}
          onClick={onSave}
        >
          Save
        </button>
      </footer>
    </div>
  );
}

function FilesPane({
  rootPath,
  rawDir,
  tree,
  loading,
  onAddFiles,
}: {
  rootPath: string;
  rawDir: string;
  tree: MarkdownTreeNode | null;
  loading: boolean;
  onAddFiles: (files: File[]) => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rawNode = useMemo(
    () => (tree ? findNodeByPath(tree, rawDir) : null),
    [tree, rawDir],
  );
  const flatFiles = useMemo(
    () => (rawNode ? flattenFiles(rawNode) : []),
    [rawNode],
  );

  async function reveal(path: string) {
    if (!rootPath) return;
    try {
      await markdownFiles.reveal(rootPath, path);
    } catch {
      // ignore
    }
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void onAddFiles(files);
    e.target.value = '';
  }

  return (
    <div className="workspace-config-pane">
      <div className="workspace-config-meta">
        <strong>Raw files</strong>
        <span className="muted small"> · {rawDir}/</span>
      </div>
      <p className="muted small">
        Drop reference materials here. Files are saved as text under the
        project's <code>raw/</code> folder so you can edit them later
        from the Markdown explorer. Binary files keep their bytes;
        non-text files may not round-trip cleanly through this modal.
      </p>
      <div
        className="workspace-config-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length > 0) void onAddFiles(files);
        }}
      >
        <span>Drop files here, or </span>
        <button
          type="button"
          className="link"
          onClick={() => fileInputRef.current?.click()}
        >
          choose files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={onPickFiles}
        />
      </div>
      {loading ? (
        <div className="muted small">Loading…</div>
      ) : flatFiles.length === 0 ? (
        <div className="muted small">No files in this folder yet.</div>
      ) : (
        <ul className="workspace-config-files">
          {flatFiles.map((f) => (
            <li key={f.path}>
              <span>{f.name}</span>
              <button type="button" className="link" onClick={() => void reveal(f.path)}>
                Reveal
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Paths = {
  instruction: string;
  memory: string;
  legacyInstruction: string | null;
  legacyMemory: string | null;
  rawDir: string;
};

function buildPaths(project: Project | null): Paths {
  if (project) {
    return {
      instruction: projectInstructionPath(project),
      memory: projectMemoryPath(project),
      legacyInstruction: legacyProjectInstructionPath(project),
      legacyMemory: legacyProjectMemoryPath(project),
      rawDir: `${projectBasePath(project)}/${PROJECT_RAW_DIR}`,
    };
  }
  return {
    instruction: defaultInstructionPath(),
    memory: defaultMemoryPath(),
    legacyInstruction: null,
    legacyMemory: null,
    rawDir: ROOT_RAW_DIR,
  };
}

async function readWithFallback(
  root: string,
  primary: string,
  legacy: string | null,
): Promise<string | null> {
  const next = await tryReadMarkdownFile(root, primary);
  if (next !== null) return next;
  if (!legacy) return null;
  return tryReadMarkdownFile(root, legacy);
}

function findNodeByPath(
  tree: MarkdownTreeNode,
  target: string,
): MarkdownTreeNode | null {
  if (tree.path === target) return tree;
  if (!tree.children) return null;
  for (const child of tree.children) {
    const found = findNodeByPath(child, target);
    if (found) return found;
  }
  return null;
}

function flattenFiles(
  node: MarkdownTreeNode,
): Array<{ name: string; path: string }> {
  if (node.kind === 'file') return [{ name: node.name, path: node.path }];
  const out: Array<{ name: string; path: string }> = [];
  for (const c of node.children ?? []) {
    out.push(...flattenFiles(c));
  }
  return out;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60_000)}m ago`;
}
