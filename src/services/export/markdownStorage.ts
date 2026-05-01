import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, remove, writeTextFile } from '@tauri-apps/plugin-fs';

const DEFAULT_SUBDIR = 'LLM-Conversations';

/**
 * Resolve the directory used for chat-history Markdown exports.
 *
 * If the user has configured a custom path in Settings, that wins; otherwise
 * we fall back to `<appData>/LLM-Conversations`. The fallback is created on
 * first access so callers can write to it without a prior setup step.
 */
export async function resolveMarkdownStorageDir(
  custom: string | undefined,
): Promise<string> {
  if (custom && custom.trim().length > 0) return custom;
  const fallback = await join(await appDataDir(), DEFAULT_SUBDIR);
  if (!(await exists(fallback))) {
    await mkdir(fallback, { recursive: true });
  }
  return fallback;
}

/** The default-fallback path, regardless of any user override. */
export async function defaultMarkdownStorageDir(): Promise<string> {
  return await join(await appDataDir(), DEFAULT_SUBDIR);
}

export type ValidateResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Verify that `path` exists and is writable by writing then removing a tiny
 * probe file. Returns a structured error so the UI can show something useful
 * without falling back to ~/Library silently.
 */
export async function validateMarkdownStorageDir(
  path: string,
): Promise<ValidateResult> {
  if (!path || !path.trim()) return { ok: false, error: 'No path selected' };
  try {
    if (!(await exists(path))) {
      return { ok: false, error: 'Folder does not exist' };
    }
  } catch (err) {
    return { ok: false, error: `Cannot read folder: ${String(err)}` };
  }
  const probe = await join(path, '.memory-canvas-write-test');
  try {
    await writeTextFile(probe, 'ok');
    await remove(probe);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: `Folder is not writable: ${String(err)}` };
  }
}
