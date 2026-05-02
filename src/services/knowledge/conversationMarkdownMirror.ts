import type { CanvasNode, Conversation, Edge, Message, Project } from '../../types';
import { buildMarkdown } from '../export/frontmatter';
import {
  ensureFolderPath,
  markdownFiles,
  resolveMarkdownRoot,
  tryReadMarkdownFile,
  writeMarkdownFileEnsuringDirs,
  type MarkdownTreeNode,
} from '../storage/MarkdownFileService';
import matter from 'gray-matter';
import {
  DEFAULT_PROJECT_DIR,
  EDGES_FILENAME,
  PROJECT_CHAT_HISTORY_DIR,
  PROJECT_INSTRUCTION_DIR,
  PROJECT_NODES_DIR,
  PROJECT_RAW_DIR,
  PROJECTS_DIR,
  ROOT_CHAT_HISTORY_DIR,
  ROOT_INSTRUCTION_DIR,
  ROOT_NODES_DIR,
  ROOT_RAW_DIR,
  conversationMirrorPathFor,
  defaultEdgesPath,
  defaultInstructionPath,
  defaultMemoryPath,
  deletedConversationLinkPathFor,
  isMirrorManagedPath,
  legacyProjectInstructionPath,
  legacyProjectMemoryPath,
  nodeMirrorPathFor,
  projectBasePath,
  projectEdgesPath,
  projectInstructionPath,
  projectMemoryPath,
  safeBaseSlug,
} from './knowledgeBaseLayout';

export const MIRROR_SOURCE_TAG = 'internal-chat';
export const NODE_MIRROR_SOURCE_TAG = 'internal-canvas';
export const DELETED_MIRROR_SOURCE_TAG = 'internal-chat-deleted';
export const EDGES_MIRROR_SOURCE_TAG = 'internal-canvas-edges';

export type MirrorSnapshot = {
  conversations: Conversation[];
  messages: Message[];
  nodes: CanvasNode[];
  edges: Edge[];
  projects: Project[];
  markdownStorageDir?: string;
  incognitoUnprojectedChats?: boolean;
};

export type MirrorResult = {
  rootPath: string;
  written: number;
  nodeWritten: number;
  edgesWritten: number;
  incognitoSkipped: number;
  skipped: number;
  deletedLinks: { conversationId: string; path: string }[];
  errors: { conversationId: string; reason: string }[];
};

/**
 * Frontmatter we write on every mirror file. We read the file back before
 * overwriting and only proceed if the existing front-matter declares the
 * same `source` tag and `conversationId`. This keeps user-authored notes
 * sitting next to mirror files safe.
 */
type MirrorFrontmatter = {
  type: 'conversation';
  conversationId: string;
  projectId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  source: typeof MIRROR_SOURCE_TAG;
  schemaVersion: 1;
};

function renderBody(
  conversation: Conversation,
  messages: Message[],
): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title || 'Untitled'}`);
  lines.push('');
  if (messages.length === 0) {
    lines.push('_(no messages)_');
    lines.push('');
  } else {
    for (const m of messages) {
      const heading =
        m.role === 'user'
          ? '## User'
          : m.role === 'assistant'
            ? '## Assistant'
            : '## System';
      const ts = (() => {
        const d = new Date(m.createdAt);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString();
      })();
      lines.push(heading);
      if (ts) lines.push(`*${ts}*`);
      lines.push('');
      lines.push(m.content || '');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function buildContent(
  conversation: Conversation,
  messages: Message[],
  project: Project | undefined,
): string {
  const fm: MirrorFrontmatter = {
    type: 'conversation',
    conversationId: conversation.id,
    projectId: project?.id ?? null,
    title: conversation.title || 'Untitled',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    source: MIRROR_SOURCE_TAG,
    schemaVersion: 1,
  };
  return buildMarkdown(fm as unknown as Record<string, unknown>, renderBody(conversation, messages));
}

function buildDeletedLinkContent(
  conversation: Conversation,
  project: Project | undefined,
  deletedPath: string,
): string {
  return buildMarkdown(
    {
      type: 'deleted-conversation-link',
      conversationId: conversation.id,
      projectId: project?.id ?? null,
      title: conversation.title || 'Untitled',
      deletedPath,
      source: DELETED_MIRROR_SOURCE_TAG,
      schemaVersion: 1,
    },
    [
      `# ${conversation.title || 'Deleted chat mirror'}`,
      '',
      'This is a placeholder for a chat-history Markdown file that was deleted.',
      '',
      `Original path: \`${deletedPath}\``,
      '',
    ].join('\n'),
  );
}

function buildNodeContent(
  node: CanvasNode,
  conversation: Conversation | undefined,
  project: Project | undefined,
): string {
  const fm = {
    type: 'canvas-node',
    nodeId: node.id,
    conversationId: node.conversationId,
    projectId: project?.id ?? null,
    sourceMessageId: node.sourceMessageId ?? null,
    title: node.title || 'Untitled',
    nodeKind: node.kind ?? 'markdown',
    mdPath: node.mdPath ?? null,
    tags: node.tags ?? [],
    themeId: node.themeId ?? null,
    importance: node.importance ?? null,
    position: node.position,
    width: node.width ?? null,
    height: node.height ?? null,
    conversationTitle: conversation?.title ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    source: NODE_MIRROR_SOURCE_TAG,
    schemaVersion: 1,
  };
  const body = node.contentMarkdown?.trim()
    ? node.contentMarkdown
    : `# ${node.title || 'Untitled'}\n`;
  return buildMarkdown(fm, body);
}

function projectInstructionTemplate(project: Project): string {
  return buildMarkdown(
    {
      type: 'project-instruction',
      projectId: project.id,
      projectName: project.name,
      source: 'user-editable',
      schemaVersion: 1,
    },
    [
      `# ${project.name} instruction`,
      '',
      project.systemPrompt?.trim()
        ? project.systemPrompt.trim()
        : '<!-- Write reusable project instructions for the chat here. -->',
      '',
    ].join('\n'),
  );
}

function projectMemoryTemplate(project: Project): string {
  return buildMarkdown(
    {
      type: 'project-memory',
      projectId: project.id,
      projectName: project.name,
      source: 'user-editable',
      schemaVersion: 1,
    },
    [
      `# ${project.name} memory`,
      '',
      '<!-- Write durable project context, decisions, and preferences here. -->',
      '',
    ].join('\n'),
  );
}

/**
 * A signature that changes whenever a conversation's mirror would change.
 * We hash the bits we serialise into the Markdown file so we don't rewrite
 * unchanged files every debounce tick.
 */
function signatureFor(
  conversation: Conversation,
  messages: Message[],
  project: Project | undefined,
): string {
  const head = [
    conversation.id,
    conversation.title,
    conversation.updatedAt,
    conversation.projectId ?? '',
    project?.name ?? '',
    messages.length.toString(),
  ].join('|');
  let last = '';
  if (messages.length > 0) {
    const tail = messages[messages.length - 1];
    last = `${tail.id}:${tail.content.length}:${tail.createdAt}`;
  }
  return `${head}#${last}`;
}

function nodeSignatureFor(
  node: CanvasNode,
  conversation: Conversation | undefined,
  project: Project | undefined,
): string {
  return [
    node.id,
    node.updatedAt,
    node.title,
    node.kind ?? '',
    node.mdPath ?? '',
    node.sourceMessageId ?? '',
    node.themeId ?? '',
    node.importance ?? '',
    JSON.stringify(node.tags ?? []),
    JSON.stringify(node.position),
    node.width ?? '',
    node.height ?? '',
    conversation?.id ?? '',
    project?.name ?? '',
    node.contentMarkdown.length,
  ].join('|');
}

/**
 * Mirror filename convention: `<slug>--<id>.md`. The `<id>` part is the
 * immutable conversation/node id; `<slug>` is a human-readable hint
 * derived from the title (mutable). Ownership is decided by the id
 * suffix alone — gray-matter / frontmatter parsing is intentionally
 * NOT used here because (a) frontmatter format has changed across
 * versions and stale files written by older code can't be parsed,
 * leaving them stuck forever, and (b) any file that ends with our
 * `--<id>.md` suffix where the id matches an active record is by
 * construction a mirror file (the ids come from `nanoid`, collision
 * with a hand-named user file is astronomical).
 */
function parseMirrorIdFromFilename(name: string): string | null {
  if (!name) return null;
  if (!name.toLowerCase().endsWith('.md')) return null;
  const stem = name.slice(0, -3);
  // Anchor on the LAST occurrence of `--` so a slug containing dashes
  // can't fool the parse. `safeBaseSlug` collapses runs of `-`, so
  // `--` only appears as the slug/id boundary in mirror files.
  const idx = stem.lastIndexOf('--');
  if (idx < 0) return null;
  const candidate = stem.slice(idx + 2);
  return /^[A-Za-z0-9_-]{6,}$/.test(candidate) ? candidate : null;
}

/** Filename-only ownership check — does this file's `--<id>.md`
 *  suffix match the supplied id? */
function pathBelongsToId(filePath: string, id: string): boolean {
  const filename = filePath.split('/').pop() ?? '';
  const parsed = parseMirrorIdFromFilename(filename);
  return parsed === id;
}

const lastSignatures = new Map<string, string>();
const lastPaths = new Map<string, string>();
const deletedMirrorLinks = new Set<string>();
const lastNodeSignatures = new Map<string, string>();
const lastNodePaths = new Map<string, string>();

/** Test/debug hook — clears the in-memory dedupe table. */
export function resetMirrorState(): void {
  lastSignatures.clear();
  lastPaths.clear();
  deletedMirrorLinks.clear();
  lastNodeSignatures.clear();
  lastNodePaths.clear();
  lastEdgesSignatures.clear();
}

/**
 * Locate a mirror file by `conversationId` so an in-session rename can
 * remove the previous-path copy. The cleanup pass at the top of
 * `syncConversationMirror` is the authoritative orphan sweep — this
 * helper is the per-write fast path so a freshly-renamed conversation
 * doesn't briefly exist at two paths between sync ticks. Filename
 * suffix is the ownership signal; we don't parse frontmatter.
 */
async function removeStaleMirror(
  rootPath: string,
  conversationId: string,
  currentPath: string,
): Promise<void> {
  const previous = lastPaths.get(conversationId);
  if (!previous || previous === currentPath) return;
  if (!pathBelongsToId(previous, conversationId)) return;
  try {
    await markdownFiles.deletePath(rootPath, previous);
  } catch (err) {
    console.warn('mirror stale-delete failed', err);
  }
}

async function removeStaleNodeMirror(
  rootPath: string,
  nodeId: string,
  currentPath: string,
): Promise<void> {
  const previous = lastNodePaths.get(nodeId);
  if (!previous || previous === currentPath) return;
  if (!pathBelongsToId(previous, nodeId)) return;
  try {
    await markdownFiles.deletePath(rootPath, previous);
  } catch (err) {
    console.warn('node mirror stale-delete failed', err);
  }
}

/**
 * Authoritative orphan sweep. Walks the entire vault and deletes any
 * mirror file whose `--<id>.md` filename suffix:
 *   (a) doesn't correspond to any live conversation / node id, or
 *   (b) corresponds to a live id but lives at a path other than the
 *       expected canonical path.
 *
 * (a) handles deletes-from-store (record gone, file lingered).
 * (b) handles slug drift (auto-title or rename moved `<slug>--<id>.md`
 *     to a new path; old file orphaned) and layout migrations (legacy
 *     `chat-history/` folder still has files after the rename to
 *     `canvas/`).
 *
 * We only consider files inside known mirror directories — `default/
 * canvas`, `default/nodes`, `projects/<slug>/canvas`, `projects/<slug>/
 * nodes`, plus the legacy `chat-history` aliases. Files without our
 * `--<id>.md` suffix (user "Add Node" notes, hand-named files,
 * `edges.md`) are never touched. Ownership is decided by filename
 * alone — frontmatter parsing is intentionally avoided because old
 * files written by previous schema versions can't always be parsed.
 */
async function runMirrorCleanup(
  rootPath: string,
  snapshot: {
    conversations: Conversation[];
    nodes: CanvasNode[];
    projects: Project[];
  },
): Promise<{ deleted: string[]; errors: { path: string; reason: string }[] }> {
  const deleted: string[] = [];
  const errors: { path: string; reason: string }[] = [];

  const projectsById = new Map(snapshot.projects.map((p) => [p.id, p]));
  const conversationsById = new Map(
    snapshot.conversations.map((c) => [c.id, c]),
  );

  const expectedConvPath = new Map<string, string>();
  for (const conv of snapshot.conversations) {
    const project = conv.projectId ? projectsById.get(conv.projectId) : undefined;
    expectedConvPath.set(conv.id, conversationMirrorPathFor(conv, project));
  }
  const expectedNodePath = new Map<string, string>();
  for (const node of snapshot.nodes) {
    const conv = conversationsById.get(node.conversationId);
    const project = conv?.projectId ? projectsById.get(conv.projectId) : undefined;
    expectedNodePath.set(node.id, nodeMirrorPathFor(node, conv, project));
  }

  const projectSlugs = snapshot.projects.map((p) => safeBaseSlug(p.name));
  // Includes the legacy `chat-history` folder name so files left behind
  // by the pre-rename layout are swept up too.
  const convDirs: string[] = [
    `${DEFAULT_PROJECT_DIR}/canvas`,
    `${DEFAULT_PROJECT_DIR}/chat-history`,
    ...projectSlugs.flatMap((slug) => [
      `${PROJECTS_DIR}/${slug}/canvas`,
      `${PROJECTS_DIR}/${slug}/chat-history`,
    ]),
  ];
  const nodeDirs: string[] = [
    `${DEFAULT_PROJECT_DIR}/nodes`,
    ...projectSlugs.map((slug) => `${PROJECTS_DIR}/${slug}/nodes`),
  ];
  const isUnderAny = (path: string, prefixes: string[]): boolean =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  let tree: MarkdownTreeNode;
  try {
    tree = await markdownFiles.listFullTree(rootPath);
  } catch (err) {
    errors.push({
      path: rootPath,
      reason: `listFullTree failed: ${String(err)}`,
    });
    return { deleted, errors };
  }

  const allFiles: string[] = [];
  const walk = (node: MarkdownTreeNode) => {
    if (node.kind === 'file') {
      allFiles.push(node.path);
    } else if (node.children) {
      for (const child of node.children) walk(child);
    }
  };
  walk(tree);

  for (const path of allFiles) {
    if (!path.toLowerCase().endsWith('.md')) continue;
    const filename = path.split('/').pop() ?? '';
    // edges.md has no id suffix and is handled by repairOrphanedMirrorFiles.
    if (filename === EDGES_FILENAME) continue;

    const id = parseMirrorIdFromFilename(filename);
    if (!id) continue; // user-authored file — leave alone.

    const inConvDir = isUnderAny(path, convDirs);
    const inNodeDir = isUnderAny(path, nodeDirs);
    if (!inConvDir && !inNodeDir) continue;

    let shouldDelete = false;
    let reason = '';
    if (inConvDir) {
      const expected = expectedConvPath.get(id);
      if (!expected) {
        shouldDelete = true;
        reason = `orphan: no live conversation has id ${id}`;
      } else if (expected !== path) {
        shouldDelete = true;
        reason = `stale path; conversation ${id} now lives at ${expected}`;
      }
    } else if (inNodeDir) {
      const expected = expectedNodePath.get(id);
      if (!expected) {
        shouldDelete = true;
        reason = `orphan: no live node has id ${id}`;
      } else if (expected !== path) {
        shouldDelete = true;
        reason = `stale path; node ${id} now lives at ${expected}`;
      }
    }

    if (!shouldDelete) continue;
    try {
      await markdownFiles.deletePath(rootPath, path);
      deleted.push(path);
      console.info(`[knowledge-mirror] cleanup deleted ${path} (${reason})`);
      // Drop in-memory trackers that pointed at the now-gone file so
      // the next sync re-emits the canonical path cleanly.
      for (const [trackedId, trackedPath] of lastPaths.entries()) {
        if (trackedPath === path) {
          lastPaths.delete(trackedId);
          lastSignatures.delete(trackedId);
        }
      }
      for (const [trackedId, trackedPath] of lastNodePaths.entries()) {
        if (trackedPath === path) {
          lastNodePaths.delete(trackedId);
          lastNodeSignatures.delete(trackedId);
        }
      }
    } catch (err) {
      errors.push({
        path,
        reason: `${reason}; delete failed: ${String(err)}`,
      });
    }
  }

  return { deleted, errors };
}

async function writeIfMissing(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<boolean> {
  const existing = await tryReadMarkdownFile(rootPath, relativePath);
  if (existing !== null) return false;
  await writeMarkdownFileEnsuringDirs(rootPath, relativePath, content);
  return true;
}

async function ensureProjectScaffold(
  rootPath: string,
  project: Project,
): Promise<number> {
  const base = projectBasePath(project);
  await ensureFolderPath(rootPath, `${base}/${PROJECT_CHAT_HISTORY_DIR}`);
  await ensureFolderPath(rootPath, `${base}/${PROJECT_NODES_DIR}`);
  await ensureFolderPath(rootPath, `${base}/${PROJECT_RAW_DIR}`);
  await ensureFolderPath(rootPath, `${base}/${PROJECT_INSTRUCTION_DIR}`);
  let written = 0;
  // Migrate legacy `[project]/instruction.md` and `[project]/memory.md` (the
  // pre-instruction-subfolder layout) into the new `[project]/instruction/`
  // location. Best-effort: failures don't block the new-file write below.
  await migrateLegacyInstructionFile(
    rootPath,
    legacyProjectInstructionPath(project),
    projectInstructionPath(project),
  );
  await migrateLegacyInstructionFile(
    rootPath,
    legacyProjectMemoryPath(project),
    projectMemoryPath(project),
  );
  if (
    await writeIfMissing(
      rootPath,
      projectInstructionPath(project),
      projectInstructionTemplate(project),
    )
  ) {
    written += 1;
  }
  if (
    await writeIfMissing(
      rootPath,
      projectMemoryPath(project),
      projectMemoryTemplate(project),
    )
  ) {
    written += 1;
  }
  return written;
}

async function ensureDefaultScaffold(rootPath: string): Promise<number> {
  await ensureFolderPath(rootPath, ROOT_CHAT_HISTORY_DIR);
  await ensureFolderPath(rootPath, ROOT_NODES_DIR);
  await ensureFolderPath(rootPath, ROOT_RAW_DIR);
  await ensureFolderPath(rootPath, ROOT_INSTRUCTION_DIR);
  let written = 0;
  if (
    await writeIfMissing(
      rootPath,
      defaultInstructionPath(),
      defaultInstructionTemplate(),
    )
  ) {
    written += 1;
  }
  if (
    await writeIfMissing(
      rootPath,
      defaultMemoryPath(),
      defaultMemoryTemplate(),
    )
  ) {
    written += 1;
  }
  return written;
}

async function migrateLegacyInstructionFile(
  rootPath: string,
  legacyPath: string,
  nextPath: string,
): Promise<void> {
  try {
    const legacy = await tryReadMarkdownFile(rootPath, legacyPath);
    if (legacy === null) return;
    const next = await tryReadMarkdownFile(rootPath, nextPath);
    if (next !== null) return;
    await writeMarkdownFileEnsuringDirs(rootPath, nextPath, legacy);
    try {
      await markdownFiles.deletePath(rootPath, legacyPath);
    } catch {
      // The new file is in place; leaving the legacy file behind is
      // not catastrophic.
    }
  } catch {
    // best-effort migration
  }
}

function defaultInstructionTemplate(): string {
  return buildMarkdown(
    {
      type: 'project-instruction',
      projectId: null,
      projectName: 'Default workspace',
      source: 'user-editable',
      schemaVersion: 1,
    },
    [
      '# Default workspace instruction',
      '',
      '<!-- Reusable instructions injected before every chat in the default (no-project) workspace. -->',
      '',
    ].join('\n'),
  );
}

function defaultMemoryTemplate(): string {
  return buildMarkdown(
    {
      type: 'project-memory',
      projectId: null,
      projectName: 'Default workspace',
      source: 'user-editable',
      schemaVersion: 1,
    },
    [
      '# Default workspace memory',
      '',
      '<!-- Durable context for the default workspace. Edited by you, read on every chat send. -->',
      '',
    ].join('\n'),
  );
}

function buildEdgesContent(
  scope: { kind: 'project'; project: Project } | { kind: 'default' },
  edges: Edge[],
  nodesById: Map<string, CanvasNode>,
): string {
  const fm = {
    type: 'canvas-edges',
    projectId: scope.kind === 'project' ? scope.project.id : null,
    projectName:
      scope.kind === 'project' ? scope.project.name : 'Default workspace',
    edgeCount: edges.length,
    source: EDGES_MIRROR_SOURCE_TAG,
    schemaVersion: 1,
  };
  const lines: string[] = [];
  if (edges.length === 0) {
    lines.push(
      scope.kind === 'project'
        ? `# ${scope.project.name} — canvas edges`
        : '# Default workspace — canvas edges',
    );
    lines.push('');
    lines.push('_(no edges yet)_');
    lines.push('');
  } else {
    lines.push(
      scope.kind === 'project'
        ? `# ${scope.project.name} — canvas edges`
        : '# Default workspace — canvas edges',
    );
    lines.push('');
    lines.push('| Source | → | Target | Label | Kind | Created |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    const sorted = [...edges].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    for (const edge of sorted) {
      const src = nodesById.get(edge.sourceNodeId);
      const tgt = nodesById.get(edge.targetNodeId);
      const srcLabel = src
        ? `[[${src.title || src.id}]]`
        : `\`${edge.sourceNodeId}\``;
      const tgtLabel = tgt
        ? `[[${tgt.title || tgt.id}]]`
        : `\`${edge.targetNodeId}\``;
      lines.push(
        `| ${srcLabel} | → | ${tgtLabel} | ${edge.label ?? ''} | ${
          edge.kind ?? ''
        } | ${edge.createdAt} |`,
      );
    }
    lines.push('');
  }
  return buildMarkdown(fm, lines.join('\n'));
}

function ownsEdgesFile(existing: string | null): boolean {
  if (existing === null) return true;
  try {
    const parsed = matter(existing);
    const data = parsed.data as { source?: unknown };
    return data.source === EDGES_MIRROR_SOURCE_TAG;
  } catch {
    return false;
  }
}

const lastEdgesSignatures = new Map<string, string>();

function edgesSignatureFor(edges: Edge[]): string {
  return edges
    .map(
      (e) =>
        `${e.id}:${e.sourceNodeId}:${e.targetNodeId}:${e.label ?? ''}:${
          e.kind ?? ''
        }`,
    )
    .sort()
    .join('|');
}

// Module-load banner. Lands once when this file is imported anywhere in
// the app. If you don't see it in devtools the bundle wasn't rebuilt or
// the import never happened — useful when diagnosing "the mirror code
// isn't running at all" cases.
if (typeof console !== 'undefined') {
  console.info('[knowledge-mirror] conversationMarkdownMirror module loaded');
}

export async function syncConversationMirror(
  snapshot: MirrorSnapshot,
): Promise<MirrorResult> {
  // Unconditional entry log so every mirror call is visible in devtools.
  // The runMirror caller in store/persistence.ts also logs around this,
  // but logging here too means we still see the call when other call
  // sites (the diagnose command, future tests) bypass that wrapper.
  console.info(
    `[knowledge-mirror] syncConversationMirror() called: configuredRoot=${
      snapshot.markdownStorageDir ?? '<unset>'
    } conversations=${snapshot.conversations.length} messages=${
      snapshot.messages.length
    } nodes=${snapshot.nodes.length} edges=${snapshot.edges.length} projects=${
      snapshot.projects.length
    }`,
  );
  const rootPath = await resolveMarkdownRoot(snapshot.markdownStorageDir);
  const projectsById = new Map(snapshot.projects.map((p) => [p.id, p]));
  const messagesByConv = new Map<string, Message[]>();
  for (const m of snapshot.messages) {
    const arr = messagesByConv.get(m.conversationId);
    if (arr) arr.push(m);
    else messagesByConv.set(m.conversationId, [m]);
  }
  for (const arr of messagesByConv.values()) {
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const incognito = snapshot.incognitoUnprojectedChats ?? false;

  // Knowledge Base layout (per docs/specs/15-...):
  // - default/{chat-history, nodes, raw, instruction/} for unprojected
  //   chats (the "default workspace" pseudo-project)
  // - projects/<slug>/{chat-history, nodes, raw, instruction/}
  //   instruction/ contains instruction.md and memory.md, both
  //   user-editable and read on every chat send.
  if (!incognito) {
    try {
      await ensureDefaultScaffold(rootPath);
    } catch (err) {
      console.warn('default scaffold failed', err);
    }
  }
  await ensureFolderPath(rootPath, PROJECTS_DIR);

  const result: MirrorResult = {
    rootPath,
    written: 0,
    nodeWritten: 0,
    edgesWritten: 0,
    incognitoSkipped: 0,
    skipped: 0,
    deletedLinks: [],
    errors: [],
  };

  for (const project of snapshot.projects) {
    try {
      result.nodeWritten += await ensureProjectScaffold(rootPath, project);
    } catch (err) {
      result.errors.push({
        conversationId: `project:${project.id}`,
        reason: `project scaffold failed: ${String(err)}`,
      });
    }
  }

  // Authoritative orphan sweep before any writes. Deletes mirror files
  // whose `--<id>.md` suffix points at a deleted record OR whose
  // current path doesn't match the canonical path the mirror would
  // write (slug drift after auto-title / rename, legacy chat-history
  // folder leftovers). User-authored files (no id suffix) are left
  // alone. Without this pass the sync would log "not owned by the
  // mirror" forever and skip writes silently.
  try {
    const cleanup = await runMirrorCleanup(rootPath, {
      conversations: snapshot.conversations,
      nodes: snapshot.nodes,
      projects: snapshot.projects,
    });
    if (cleanup.deleted.length > 0) {
      console.info(
        `[knowledge-mirror] cleanup removed ${cleanup.deleted.length} stale mirror file(s)`,
      );
    }
    for (const e of cleanup.errors) {
      result.errors.push({
        conversationId: 'cleanup',
        reason: `${e.path}: ${e.reason}`,
      });
    }
  } catch (err) {
    console.warn('mirror cleanup failed', err);
  }

  for (const conv of snapshot.conversations) {
    const project = conv.projectId ? projectsById.get(conv.projectId) : undefined;
    if (!project && incognito) {
      result.incognitoSkipped += 1;
      result.skipped += 1;
      continue;
    }
    const messages = messagesByConv.get(conv.id) ?? [];
    const signature = signatureFor(conv, messages, project);
    const path = conversationMirrorPathFor(conv, project);

    if (lastSignatures.get(conv.id) === signature && lastPaths.get(conv.id) === path) {
      result.skipped += 1;
      continue;
    }

    try {
      await removeStaleMirror(rootPath, conv.id, path);
      const existing = await tryReadMarkdownFile(rootPath, path);
      if (
        existing === null &&
        lastPaths.get(conv.id) === path &&
        lastSignatures.has(conv.id) &&
        !deletedMirrorLinks.has(conv.id)
      ) {
        const linkPath = deletedConversationLinkPathFor(conv, project);
        await writeMarkdownFileEnsuringDirs(
          rootPath,
          linkPath,
          buildDeletedLinkContent(conv, project, path),
        );
        deletedMirrorLinks.add(conv.id);
        lastPaths.set(conv.id, linkPath);
        result.deletedLinks.push({ conversationId: conv.id, path: linkPath });
        result.written += 1;
        continue;
      }
      if (deletedMirrorLinks.has(conv.id)) {
        result.skipped += 1;
        continue;
      }
      // Filename-based ownership check. A file at `path` either has
      // the matching `--<id>.md` suffix (then it's ours from a prior
      // sync, safe to overwrite) or it's a hand-named user file we
      // must not touch. The cleanup pass at the top of this sync
      // already deleted any stale mirror file, so reaching here with
      // a non-matching filename means a deliberate user collision.
      if (existing !== null && !pathBelongsToId(path, conv.id)) {
        result.skipped += 1;
        result.errors.push({
          conversationId: conv.id,
          reason: `path ${path} doesn't carry our id suffix; refusing to clobber a user-named file`,
        });
        continue;
      }
      const content = buildContent(conv, messages, project);
      await writeMarkdownFileEnsuringDirs(rootPath, path, content);
      lastSignatures.set(conv.id, signature);
      lastPaths.set(conv.id, path);
      result.written += 1;
    } catch (err) {
      result.errors.push({ conversationId: conv.id, reason: String(err) });
    }
  }

  const conversationsById = new Map(snapshot.conversations.map((c) => [c.id, c]));
  for (const node of snapshot.nodes) {
    const conv = conversationsById.get(node.conversationId);
    const project = conv?.projectId ? projectsById.get(conv.projectId) : undefined;
    if (!project && incognito) {
      result.incognitoSkipped += 1;
      result.skipped += 1;
      continue;
    }
    const path = nodeMirrorPathFor(node, conv, project);
    const signature = nodeSignatureFor(node, conv, project);
    if (
      lastNodeSignatures.get(node.id) === signature &&
      lastNodePaths.get(node.id) === path
    ) {
      result.skipped += 1;
      continue;
    }
    try {
      await removeStaleNodeMirror(rootPath, node.id, path);
      const existing = await tryReadMarkdownFile(rootPath, path);
      if (existing !== null && !pathBelongsToId(path, node.id)) {
        result.skipped += 1;
        result.errors.push({
          conversationId: node.conversationId,
          reason: `path ${path} doesn't carry our id suffix; refusing to clobber a user-named file`,
        });
        continue;
      }
      await writeMarkdownFileEnsuringDirs(
        rootPath,
        path,
        buildNodeContent(node, conv, project),
      );
      lastNodeSignatures.set(node.id, signature);
      lastNodePaths.set(node.id, path);
      result.nodeWritten += 1;
    } catch (err) {
      result.errors.push({
        conversationId: node.conversationId,
        reason: `node mirror failed: ${String(err)}`,
      });
    }
  }

  // Edges mirror: one `nodes/edges.md` per project (and default workspace),
  // grouped by the project of the source node's conversation. Edges whose
  // source node was deleted are skipped.
  const nodesById = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const edgesByProject = new Map<string | null, Edge[]>();
  for (const edge of snapshot.edges) {
    const src = nodesById.get(edge.sourceNodeId);
    if (!src) continue;
    const conv = conversationsById.get(src.conversationId);
    const projectId = conv?.projectId ?? null;
    const arr = edgesByProject.get(projectId) ?? [];
    arr.push(edge);
    edgesByProject.set(projectId, arr);
  }
  // Always emit an empty edges file for projects/default that have no
  // edges (so users can spot it). Skip default if incognito.
  const projectIdsToEmit: (string | null)[] = [
    ...(incognito ? [] : [null]),
    ...snapshot.projects.map((p) => p.id),
  ];
  for (const projectId of projectIdsToEmit) {
    const project = projectId ? projectsById.get(projectId) : undefined;
    if (projectId && !project) continue;
    const path = project ? projectEdgesPath(project) : defaultEdgesPath();
    const edges = edgesByProject.get(projectId) ?? [];
    const signature = edgesSignatureFor(edges);
    if (lastEdgesSignatures.get(path) === signature) {
      continue;
    }
    try {
      const existing = await tryReadMarkdownFile(rootPath, path);
      if (!ownsEdgesFile(existing)) {
        result.skipped += 1;
        result.errors.push({
          conversationId: project ? `project:${project.id}` : 'default',
          reason: `existing edges file at ${path} is not owned by the mirror`,
        });
        continue;
      }
      const content = buildEdgesContent(
        project ? { kind: 'project', project } : { kind: 'default' },
        edges,
        nodesById,
      );
      await writeMarkdownFileEnsuringDirs(rootPath, path, content);
      lastEdgesSignatures.set(path, signature);
      result.edgesWritten += 1;
    } catch (err) {
      result.errors.push({
        conversationId: project ? `project:${project.id}` : 'default',
        reason: `edges mirror failed: ${String(err)}`,
      });
    }
  }

  return result;
}

/**
 * Inspect a single Markdown file's frontmatter to decide whether it is a
 * mirrored chat file. Used by the editor banner and the file-tree badge.
 */
export function isMirroredFile(content: string | null | undefined): boolean {
  if (!content) return false;
  try {
    const parsed = matter(content);
    const data = parsed.data as { source?: unknown };
    return data.source === MIRROR_SOURCE_TAG;
  } catch {
    return false;
  }
}

/**
 * Walk every canonical mirror target path (one per conversation, node, and
 * edges file) and delete any file there that fails the ownership check —
 * frontmatter missing, schema-version drift, or in-canvas edits stripped
 * `source:`. The mirror's "not owned" guard refuses to overwrite these,
 * which causes the persistent error spam in the console; deleting them
 * lets the next sync regenerate clean copies.
 *
 * Destructive: any in-canvas edits saved into a mirror-managed file are
 * lost. Files at non-mirror paths (e.g. user-authored notes from "Add
 * Node") are untouched because their paths never appear in this scan.
 */
export async function repairOrphanedMirrorFiles(snapshot: {
  conversations: Conversation[];
  nodes: CanvasNode[];
  projects: Project[];
  markdownStorageDir?: string;
}): Promise<{
  deleted: string[];
  errors: { path: string; reason: string }[];
  /** Node ids whose `mdPath` pointed at a mirror-managed location and
   *  should be cleared so the next save re-canonicalises them. */
  nodeIdsToClearMdPath: string[];
}> {
  const rootPath = await resolveMarkdownRoot(snapshot.markdownStorageDir);

  const deleted: string[] = [];
  const errors: { path: string; reason: string }[] = [];
  const nodeIdsToClearMdPath: string[] = [];

  async function tryDelete(path: string): Promise<void> {
    try {
      await markdownFiles.deletePath(rootPath, path);
      deleted.push(path);
    } catch (err) {
      errors.push({ path, reason: String(err) });
    }
  }

  // Authoritative cleanup pass — same logic the sync pipeline uses.
  // This deletes orphaned mirror files at any expected current path
  // whose `--<id>.md` suffix doesn't match the live id, and any
  // mirror-named file whose id has been removed from the store.
  const cleanup = await runMirrorCleanup(rootPath, {
    conversations: snapshot.conversations,
    nodes: snapshot.nodes,
    projects: snapshot.projects,
  });
  for (const p of cleanup.deleted) deleted.push(p);
  for (const e of cleanup.errors) errors.push(e);

  for (const node of snapshot.nodes) {
    // Cycle-breaker: any node whose `mdPath` aims at a mirror file would
    // re-clobber the mirror's frontmatter on the next in-canvas save.
    // Clear it so the canonical-path helper mints a fresh user file.
    if (isMirrorManagedPath(node.mdPath)) {
      nodeIdsToClearMdPath.push(node.id);
    }
  }

  const edgesScopes: (Project | null)[] = [null, ...snapshot.projects];
  for (const project of edgesScopes) {
    const path = project ? projectEdgesPath(project) : defaultEdgesPath();
    const existing = await tryReadMarkdownFile(rootPath, path);
    if (existing !== null && !ownsEdgesFile(existing)) {
      await tryDelete(path);
    }
  }

  // Reset the in-memory dedupe so the next sync re-emits everything we
  // just cleared. Without this, the mirror would think it had already
  // written the deleted paths and skip them.
  resetMirrorState();
  lastEdgesSignatures.clear();

  return { deleted, errors, nodeIdsToClearMdPath };
}
