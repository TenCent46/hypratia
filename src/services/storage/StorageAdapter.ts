import type { StorageFile } from './files';

export interface StorageAdapter {
  loadJson<T>(file: StorageFile, fallback: T): Promise<T>;
  saveJson<T>(file: StorageFile, data: T): Promise<void>;
  baseDirPath(): Promise<string>;
}
