import type { Conversation, Message, Project } from '../../types';
import { slugify } from '../export/filenames';
import { buildMarkdown } from '../export/frontmatter';
import {
  ensureFolderPath,
  markdownFiles,
  resolveMarkdownRoot,
  tryReadMarkdownFile,
  writeMarkdownFileEnsuringDirs,
} from '../storage/MarkdownFileService';
import matter from 'gray-matter';

export const MIRROR_SOURCE_TAG = 'internal-chat';

export type MirrorSnapshot = {
  conversations: Conversation[];
  messages: Message[];
  projects: Project[];
  markdownStorageDir?: string;
};

export type MirrorResult = {
  rootPath: string;
  written: number;
  skipped: number;
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

function safeBaseSlug(title: string): string {
  const slug = slugify(title);
  return slug || 'untitled';
}

function ymOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '0000-00';
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

function mirrorPathFor(
  conversation: Conversation,
  project: Project | undefined,
): string {
  const slug = safeBaseSlug(conversation.title);
  const filename = `${slug}--${conversation.id}.md`;
  if (project) {
    const projectSlug = safeBaseSlug(project.name);
    return `Projects/${projectSlug}/${filename}`;
  }
  return `Chats/${ymOf(conversation.createdAt)}/${filename}`;
}

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

/** Returns true if the file is safe for us to overwrite. */
function ownsFile(
  existing: string | null,
  conversationId: string,
): boolean {
  if (existing === null) return true;
  try {
    const parsed = matter(existing);
    const data = parsed.data as { source?: unknown; conversationId?: unknown };
    return (
      data.source === MIRROR_SOURCE_TAG && data.conversationId === conversationId
    );
  } catch {
    return false;
  }
}

const lastSignatures = new Map<string, string>();
const lastPaths = new Map<string, string>();

/** Test/debug hook — clears the in-memory dedupe table. */
export function resetMirrorState(): void {
  lastSignatures.clear();
  lastPaths.clear();
}

/**
 * Locate a mirror file by `conversationId` so renames can remove the
 * stale slug copy. We only delete files whose frontmatter identifies them
 * as our own mirror for this `conversationId` — user files outside the
 * mirror are never touched.
 */
async function removeStaleMirror(
  rootPath: string,
  conversationId: string,
  currentPath: string,
): Promise<void> {
  const previous = lastPaths.get(conversationId);
  if (!previous || previous === currentPath) return;
  const existing = await tryReadMarkdownFile(rootPath, previous);
  if (!ownsFile(existing, conversationId)) return;
  try {
    await markdownFiles.deletePath(rootPath, previous);
  } catch (err) {
    console.warn('mirror stale-delete failed', err);
  }
}

export async function syncConversationMirror(
  snapshot: MirrorSnapshot,
): Promise<MirrorResult> {
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

  // Make sure the two top-level folders exist eagerly so the explorer
  // shows them even before any conversation has messages.
  await ensureFolderPath(rootPath, 'Chats');
  await ensureFolderPath(rootPath, 'Projects');

  const result: MirrorResult = { rootPath, written: 0, skipped: 0, errors: [] };

  for (const conv of snapshot.conversations) {
    const project = conv.projectId ? projectsById.get(conv.projectId) : undefined;
    const messages = messagesByConv.get(conv.id) ?? [];
    const signature = signatureFor(conv, messages, project);
    const path = mirrorPathFor(conv, project);

    if (lastSignatures.get(conv.id) === signature && lastPaths.get(conv.id) === path) {
      result.skipped += 1;
      continue;
    }

    try {
      await removeStaleMirror(rootPath, conv.id, path);
      const existing = await tryReadMarkdownFile(rootPath, path);
      if (!ownsFile(existing, conv.id)) {
        result.skipped += 1;
        result.errors.push({
          conversationId: conv.id,
          reason: `existing file at ${path} is not owned by the mirror`,
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
