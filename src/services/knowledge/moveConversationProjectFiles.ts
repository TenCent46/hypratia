import type { Attachment, Conversation, ID, Project } from '../../types';
import { useStore } from '../../store';
import {
  absoluteMarkdownPath,
  ensureFolderPath,
  pathExists,
  renameFile,
  resolveMarkdownRoot,
} from '../storage/MarkdownFileService';
import {
  PROJECT_RAW_DIR,
  ROOT_RAW_DIR,
  projectBasePath,
} from './knowledgeBaseLayout';

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

async function uniqueRelPath(rootPath: string, dir: string, filename: string): Promise<string> {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let candidate = `${dir}/${filename}`;
  for (let i = 2; await pathExists(await absoluteMarkdownPath(rootPath, candidate)); i += 1) {
    candidate = `${dir}/${stem} (${i})${ext}`;
  }
  return candidate;
}

function rawDirFor(project: Project | undefined): string {
  return project ? `${projectBasePath(project)}/${PROJECT_RAW_DIR}` : ROOT_RAW_DIR;
}

function collectAttachmentIds(conversationId: ID): Set<ID> {
  const state = useStore.getState();
  const ids = new Set<ID>();
  for (const m of state.messages) {
    if (m.conversationId !== conversationId) continue;
    for (const id of m.attachmentIds ?? []) ids.add(id);
  }
  for (const n of state.nodes) {
    if (n.conversationId !== conversationId) continue;
    for (const id of n.attachmentIds ?? []) ids.add(id);
  }
  return ids;
}

function isReferencedOutsideConversation(attachmentId: ID, conversationId: ID): boolean {
  const state = useStore.getState();
  return (
    state.messages.some(
      (m) =>
        m.conversationId !== conversationId &&
        (m.attachmentIds ?? []).includes(attachmentId),
    ) ||
    state.nodes.some(
      (n) =>
        n.conversationId !== conversationId &&
        (n.attachmentIds ?? []).includes(attachmentId),
    )
  );
}

/**
 * Move vault-backed raw files that belong to a conversation when the chat is
 * reassigned to another project. The JSON conversation update remains the
 * source of truth; this keeps already-ingested working-folder files in the
 * same project raw folder the app will use for future files.
 */
export async function moveConversationProjectFiles(
  conversationId: ID,
  targetProjectId: ID | null,
): Promise<{ moved: number; skipped: number; errors: string[] }> {
  const state = useStore.getState();
  const conversation: Conversation | undefined = state.conversations.find(
    (c) => c.id === conversationId,
  );
  if (!conversation) return { moved: 0, skipped: 0, errors: ['conversation not found'] };

  const targetProject = targetProjectId
    ? state.projects.find((p) => p.id === targetProjectId)
    : undefined;
  if (targetProjectId && !targetProject) {
    return { moved: 0, skipped: 0, errors: ['target project not found'] };
  }

  const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
  const targetRawDir = rawDirFor(targetProject);
  await ensureFolderPath(rootPath, targetRawDir);

  const updateAttachment = useStore.getState().updateAttachment;
  const byId = new Map(state.attachments.map((a) => [a.id, a]));
  let moved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of collectAttachmentIds(conversationId)) {
    const att: Attachment | undefined = byId.get(id);
    if (!att || att.storageRoot !== 'vault') {
      skipped += 1;
      continue;
    }
    if (isReferencedOutsideConversation(id, conversationId)) {
      skipped += 1;
      continue;
    }
    if (dirname(att.relPath) === targetRawDir) {
      skipped += 1;
      continue;
    }

    try {
      const from = await absoluteMarkdownPath(rootPath, att.relPath);
      if (!(await pathExists(from))) {
        skipped += 1;
        continue;
      }
      const nextRelPath = await uniqueRelPath(rootPath, targetRawDir, basename(att.relPath));
      const to = await absoluteMarkdownPath(rootPath, nextRelPath);
      await renameFile(from, to);
      updateAttachment(att.id, { relPath: nextRelPath });
      moved += 1;
    } catch (err) {
      errors.push(`${att.filename}: ${String(err)}`);
    }
  }

  return { moved, skipped, errors };
}
