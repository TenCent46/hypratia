import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import type { StorageAdapter } from './StorageAdapter';
import type { StorageFile } from './files';

export class TauriJsonStorage implements StorageAdapter {
  private base: string | null = null;

  async baseDirPath(): Promise<string> {
    if (this.base !== null) return this.base;
    const dir = await appDataDir();
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
    this.base = dir;
    return dir;
  }

  private async pathFor(file: StorageFile): Promise<string> {
    return await join(await this.baseDirPath(), file);
  }

  async loadJson<T>(file: StorageFile, fallback: T): Promise<T> {
    try {
      const p = await this.pathFor(file);
      if (!(await exists(p))) return fallback;
      const text = await readTextFile(p);
      return JSON.parse(text) as T;
    } catch (err) {
      console.error(`[storage] load(${file}) failed`, err);
      return fallback;
    }
  }

  async saveJson<T>(file: StorageFile, data: T): Promise<void> {
    try {
      const p = await this.pathFor(file);
      const tmp = `${p}.tmp`;
      await writeTextFile(tmp, JSON.stringify(data, null, 2));
      await rename(tmp, p);
    } catch (err) {
      console.error(`[storage] save(${file}) failed`, err);
    }
  }
}
