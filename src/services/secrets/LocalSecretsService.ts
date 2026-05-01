import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import type { SecretsService } from './SecretsService';

/**
 * Local plaintext secrets file. Pragmatic v1.0-beta security.
 *
 * SECURITY NOTES:
 * - Stored at <appData>/secrets.json. macOS FileVault encrypts this at rest by default.
 * - For v1.0 final, swap with `tauri-plugin-keyring` (OS keychain) — same interface,
 *   no API changes elsewhere.
 * - The file is NEVER committed and is excluded from Obsidian export and search.
 */
export class LocalSecretsService implements SecretsService {
  private cache: Record<string, string> | null = null;
  private base: string | null = null;

  private async pathFor(): Promise<string> {
    if (this.base !== null) return this.base;
    const dir = await appDataDir();
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    this.base = await join(dir, 'secrets.json');
    return this.base;
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    const path = await this.pathFor();
    if (!(await exists(path))) {
      this.cache = {};
      return this.cache;
    }
    try {
      this.cache = JSON.parse(await readTextFile(path)) as Record<string, string>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async save(): Promise<void> {
    const path = await this.pathFor();
    const tmp = `${path}.tmp`;
    await writeTextFile(tmp, JSON.stringify(this.cache ?? {}, null, 2));
    await rename(tmp, path);
  }

  async set(key: string, value: string): Promise<void> {
    const map = await this.load();
    map[key] = value;
    await this.save();
  }

  async get(key: string): Promise<string | null> {
    const map = await this.load();
    return map[key] ?? null;
  }

  async remove(key: string): Promise<void> {
    const map = await this.load();
    if (key in map) {
      delete map[key];
      await this.save();
    }
  }

  async has(key: string): Promise<boolean> {
    const map = await this.load();
    return key in map;
  }

  async list(): Promise<string[]> {
    const map = await this.load();
    return Object.keys(map);
  }
}
