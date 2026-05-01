import type { CanvasNode, Conversation, Project } from '../../types';
import { slugify } from '../export/filenames';

export const DEFAULT_PROJECT_DIR = 'default';
export const ROOT_CHAT_HISTORY_DIR = `${DEFAULT_PROJECT_DIR}/chat-history`;
export const ROOT_NODES_DIR = `${DEFAULT_PROJECT_DIR}/nodes`;
export const ROOT_RAW_DIR = `${DEFAULT_PROJECT_DIR}/raw`;
export const ROOT_INSTRUCTION_DIR = `${DEFAULT_PROJECT_DIR}/instruction`;
export const ROOT_DELETED_DIR = `${DEFAULT_PROJECT_DIR}/deleted`;
export const PROJECTS_DIR = 'projects';
export const PROJECT_CHAT_HISTORY_DIR = 'chat-history';
export const PROJECT_NODES_DIR = 'nodes';
export const PROJECT_RAW_DIR = 'raw';
export const PROJECT_INSTRUCTION_DIR = 'instruction';
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
    return `${projectBasePath(project)}/${DELETED_DIR}/chat-history/${filename}`;
  }
  return `${ROOT_DELETED_DIR}/chat-history/${filename}`;
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
