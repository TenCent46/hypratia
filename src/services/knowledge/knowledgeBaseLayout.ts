import type { CanvasNode, Conversation, Project } from '../../types';
import { slugify } from '../export/filenames';

export const DEFAULT_PROJECT_DIR = 'default';
export const ROOT_CHAT_HISTORY_DIR = `${DEFAULT_PROJECT_DIR}/canvas`;
export const ROOT_NODES_DIR = `${DEFAULT_PROJECT_DIR}/nodes`;
export const ROOT_RAW_DIR = `${DEFAULT_PROJECT_DIR}/raw`;
export const ROOT_INSTRUCTION_DIR = `${DEFAULT_PROJECT_DIR}/instruction`;
export const ROOT_DELETED_DIR = `${DEFAULT_PROJECT_DIR}/deleted`;
export const PROJECTS_DIR = 'projects';
export const PROJECT_CHAT_HISTORY_DIR = 'canvas';
export const PROJECT_NODES_DIR = 'nodes';
export const PROJECT_RAW_DIR = 'raw';
export const PROJECT_INSTRUCTION_DIR = 'instruction';
export const PROJECT_PROCESSED_DIR = 'processed';
export const DELETED_DIR = 'deleted';
export const EDGES_FILENAME = 'edges.md';

export function safeBaseSlug(title: string): string {
  const slug = slugify(title);
  return slug || 'untitled';
}

export function ymOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '0000-00';
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

export function projectBasePath(project: Project): string {
  return `${PROJECTS_DIR}/${safeBaseSlug(project.name)}`;
}

export function projectInstructionPath(project: Project): string {
  return `${projectBasePath(project)}/${PROJECT_INSTRUCTION_DIR}/instruction.md`;
}

export function projectMemoryPath(project: Project): string {
  return `${projectBasePath(project)}/${PROJECT_INSTRUCTION_DIR}/memory.md`;
}

export function projectMetaInstructionPath(project: Project): string {
  return `${projectBasePath(project)}/${PROJECT_INSTRUCTION_DIR}/meta-instruction.md`;
}

export function projectRawPath(project: Project): string {
  return `${projectBasePath(project)}/${PROJECT_RAW_DIR}`;
}

export function projectProcessedPath(project: Project): string {
  return `${projectBasePath(project)}/${PROJECT_PROCESSED_DIR}`;
}

/** Legacy path (pre-instruction-subfolder layout). Read-only for migration. */
export function legacyProjectInstructionPath(project: Project): string {
  return `${projectBasePath(project)}/instruction.md`;
}

/** Legacy path (pre-instruction-subfolder layout). Read-only for migration. */
export function legacyProjectMemoryPath(project: Project): string {
  return `${projectBasePath(project)}/memory.md`;
}

export function defaultInstructionPath(): string {
  return `${ROOT_INSTRUCTION_DIR}/instruction.md`;
}

export function defaultMemoryPath(): string {
  return `${ROOT_INSTRUCTION_DIR}/memory.md`;
}

export function defaultMetaInstructionPath(): string {
  return `${ROOT_INSTRUCTION_DIR}/meta-instruction.md`;
}

export function defaultProcessedPath(): string {
  return `${DEFAULT_PROJECT_DIR}/${PROJECT_PROCESSED_DIR}`;
}

export function projectEdgesPath(project: Project): string {
  return `${projectBasePath(project)}/${PROJECT_NODES_DIR}/${EDGES_FILENAME}`;
}

export function defaultEdgesPath(): string {
  return `${ROOT_NODES_DIR}/${EDGES_FILENAME}`;
}

export function conversationMirrorPathFor(
  conversation: Conversation,
  project: Project | undefined,
): string {
  const filename = `${safeBaseSlug(conversation.title)}--${conversation.id}.md`;
  const ym = ymOf(conversation.createdAt);
  if (project) {
    return `${projectBasePath(project)}/${PROJECT_CHAT_HISTORY_DIR}/${ym}/${filename}`;
  }
  return `${ROOT_CHAT_HISTORY_DIR}/${ym}/${filename}`;
}

export function deletedConversationLinkPathFor(
  conversation: Conversation,
  project: Project | undefined,
): string {
  const filename = `${safeBaseSlug(conversation.title)}--${conversation.id}.md`;
  if (project) {
    return `${projectBasePath(project)}/${DELETED_DIR}/canvas/${filename}`;
  }
  return `${ROOT_DELETED_DIR}/canvas/${filename}`;
}

export function nodeMirrorPathFor(
  node: CanvasNode,
  conversation: Conversation | undefined,
  project: Project | undefined,
): string {
  const title = node.title || node.mdPath || node.id;
  const filename = `${safeBaseSlug(title)}--${node.id}.md`;
  if (project) return `${projectBasePath(project)}/${PROJECT_NODES_DIR}/${filename}`;
  const bucket = ymOf(conversation?.createdAt ?? node.createdAt);
  return `${ROOT_NODES_DIR}/${bucket}/${filename}`;
}

/**
 * Returns true for paths that the conversation/node mirror writes to. Used
 * by the Markdown editor and `ensureNodeMarkdownPath` to refuse direct
 * user-content writes there — otherwise saving an in-canvas edit clobbers
 * the mirror's frontmatter and produces "not owned by the mirror" errors
 * on the next sync.
 *
 * Layout patterns considered mirror-managed:
 *   <workspace>/nodes/...                      (node mirror, includes edges.md)
 *   <workspace>/canvas/<YYYY-MM>/...           (conversation mirror)
 *
 * User-authored "Add Node" files live at `<workspace>/canvas/<title>.md`
 * (no YYYY-MM bucket) and are NOT matched.
 */
export function isMirrorManagedPath(path: string | undefined | null): boolean {
  if (!path) return false;
  if (!path.endsWith('.md')) return false;
  if (/(^|\/)nodes\//.test(path)) return true;
  if (/(^|\/)canvas\/\d{4}-\d{2}\//.test(path)) return true;
  return false;
}
