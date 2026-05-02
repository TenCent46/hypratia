import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { exists, rename } from '@tauri-apps/plugin-fs';
import { resolveMarkdownStorageDir } from '../export/markdownStorage';

export type MarkdownTreeNode = {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  children?: MarkdownTreeNode[];
};

export async function resolveMarkdownRoot(
  customPath: string | undefined,
): Promise<string> {
  return await resolveMarkdownStorageDir(customPath);
}

export async function absoluteMarkdownPath(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  return relativePath ? await join(rootPath, relativePath) : rootPath;
}

export const markdownFiles = {
  async listTree(rootPath: string): Promise<MarkdownTreeNode> {
    return await invoke<MarkdownTreeNode>('list_markdown_tree', { rootPath });
  },

  /** Like `listTree` but includes files of any extension. Used by the
      workspace-config Files panel so PDFs / spreadsheets / images that
      land in `raw/` are visible. */
  async listFullTree(rootPath: string): Promise<MarkdownTreeNode> {
    return await invoke<MarkdownTreeNode>('list_full_tree', { rootPath });
  },

  async readFile(rootPath: string, path: string): Promise<string> {
    return await invoke<string>('read_markdown_file', { rootPath, path });
  },

  async writeFile(
    rootPath: string,
    path: string,
    content: string,
  ): Promise<void> {
    await invoke('write_markdown_file', { rootPath, path, content });
  },

  async tryReadFile(rootPath: string, path: string): Promise<string | null> {
    return await invoke<string | null>('try_read_markdown_file', {
      rootPath,
      path,
    });
  },

  async createFile(
    rootPath: string,
    parentPath: string,
    fileName: string,
  ): Promise<string> {
    return await invoke<string>('create_markdown_file', {
      rootPath,
      parentPath,
      fileName,
    });
  },

  async createFolder(
    rootPath: string,
    parentPath: string,
    folderName: string,
  ): Promise<string> {
    return await invoke<string>('create_folder', {
      rootPath,
      parentPath,
      folderName,
    });
  },

  async renamePath(
    rootPath: string,
    path: string,
    newName: string,
  ): Promise<string> {
    return await invoke<string>('rename_path', { rootPath, path, newName });
  },

  async deletePath(rootPath: string, path: string): Promise<void> {
    await invoke('delete_path', { rootPath, path });
  },

  async reveal(rootPath: string, path: string): Promise<void> {
    await invoke('reveal_markdown_path', { rootPath, path });
  },
};

/**
 * Recursively ensure each segment of `relativePath` exists as a folder
 * under `rootPath`. Existing segments are skipped. Used by the chat
 * Markdown mirror to create `Chats/YYYY-MM/` and `Projects/<slug>/` lazily.
 */
export async function ensureFolderPath(
  rootPath: string,
  relativePath: string,
): Promise<void> {
  if (!relativePath) return;
  const segments = relativePath.split('/').filter(Boolean);
  let parent = '';
  for (const segment of segments) {
    try {
      await markdownFiles.createFolder(rootPath, parent, segment);
    } catch {
      // Folder already exists or was created by a sibling sync — ignore.
    }
    parent = parent ? `${parent}/${segment}` : segment;
  }
}

/**
 * Read a file relative to the Markdown root, returning `null` if the file
 * does not exist or is unreadable. Use this when you want to inspect a
 * file without paying the cost of an outer try/catch at every call site.
 */
export async function tryReadMarkdownFile(
  rootPath: string,
  relativePath: string,
): Promise<string | null> {
  try {
    return await markdownFiles.tryReadFile(rootPath, relativePath);
  } catch {
    return null;
  }
}

/**
 * Whether a file or folder exists at the given absolute path. Wraps
 * `@tauri-apps/plugin-fs`'s `exists` so the rest of the app can check
 * vault paths without importing the Tauri plugin directly (the eslint
 * `no-restricted-imports` rule keeps platform calls inside this layer).
 */
export async function pathExists(absolutePath: string): Promise<boolean> {
  return await exists(absolutePath);
}

/**
 * Move/rename a file using absolute paths. Used when the relative-path
 * Rust command is too narrow — e.g. moving an attachment between
 * project subtrees keeps the basename but switches the parent folder.
 */
export async function renameFile(
  absoluteFrom: string,
  absoluteTo: string,
): Promise<void> {
  await rename(absoluteFrom, absoluteTo);
}

/**
 * Write a Markdown file, creating any missing parent folders first. The
 * Rust `write_markdown_file` command requires the parent directory to
 * exist, so callers that produce nested paths (e.g. mirror writes into
 * `Chats/YYYY-MM/foo.md`) must go through this helper.
 */
export async function writeMarkdownFileEnsuringDirs(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length > 1) {
    const parent = segments.slice(0, -1).join('/');
    await ensureFolderPath(rootPath, parent);
  }
  await markdownFiles.writeFile(rootPath, relativePath, content);
}
