import {
  markdownFiles,
  resolveMarkdownRoot,
  tryReadMarkdownFile,
} from '../storage/MarkdownFileService';
import { useStore } from '../../store';
import type { Project } from '../../types';
import {
  DEFAULT_PROJECT_DIR,
  PROJECTS_DIR,
  projectBasePath,
} from './knowledgeBaseLayout';
import { resetMirrorState } from './conversationMarkdownMirror';

/**
 * Wipe a folder under the Knowledge Base root and ignore "missing" errors.
 *
 * `delete_path` (Tauri command) errors when the target doesn't exist;
 * that's not a failure for our use case (a fresh vault has no `default/`
 * yet). We probe with `try_read_markdown_file` on a sentinel inside the
 * folder, but the simpler check is: just try to delete and swallow
 * "not found" / "directory does not exist" style errors.
 */
async function safeDeleteFolder(rootPath: string, relPath: string): Promise<boolean> {
  try {
    await markdownFiles.deletePath(rootPath, relPath);
    return true;
  } catch (err) {
    const message = String(err).toLowerCase();
    if (
      message.includes('no such file') ||
      message.includes('not found') ||
      message.includes('cannot find') ||
      message.includes('does not exist')
    ) {
      return false;
    }
    // Confirm whether anything is actually there. If the directory really
    // is gone (different filesystems word the error differently), treat
    // it as "nothing to delete".
    const probe = await tryReadMarkdownFile(rootPath, `${relPath}/.probe.md`);
    if (probe === null) {
      return false;
    }
    throw err;
  }
}

function triggerResync(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('mc:knowledge-sync-request'));
  window.dispatchEvent(new CustomEvent('mc:knowledge-tree-refresh'));
}

export type ResetKnowledgeBaseResult = {
  rootPath: string;
  scope: 'all' | 'project' | 'default';
  cleared: string[];
};

/**
 * Wipe every mirror-managed folder under the working folder and re-mirror
 * from the JSON store. User-authored files outside `default/` and
 * `projects/` are not touched.
 */
export async function resetAllKnowledgeBase(): Promise<ResetKnowledgeBaseResult> {
  const state = useStore.getState();
  const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
  const cleared: string[] = [];
  if (await safeDeleteFolder(rootPath, DEFAULT_PROJECT_DIR)) {
    cleared.push(DEFAULT_PROJECT_DIR);
  }
  if (await safeDeleteFolder(rootPath, PROJECTS_DIR)) {
    cleared.push(PROJECTS_DIR);
  }
  // Drop the in-memory dedupe so the next sync re-emits every conversation,
  // node, and edges.md from scratch.
  resetMirrorState();
  triggerResync();
  return { rootPath, scope: 'all', cleared };
}

/**
 * Wipe a single project's folder (or `default/` for the no-project
 * workspace) and re-mirror from the JSON store.
 */
export async function resetProjectKnowledgeBase(
  project: Project | null,
): Promise<ResetKnowledgeBaseResult> {
  const state = useStore.getState();
  const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
  const cleared: string[] = [];
  if (project) {
    const base = projectBasePath(project);
    if (await safeDeleteFolder(rootPath, base)) cleared.push(base);
  } else {
    if (await safeDeleteFolder(rootPath, DEFAULT_PROJECT_DIR)) {
      cleared.push(DEFAULT_PROJECT_DIR);
    }
  }
  resetMirrorState();
  triggerResync();
  return {
    rootPath,
    scope: project ? 'project' : 'default',
    cleared,
  };
}
