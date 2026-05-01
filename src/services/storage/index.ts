import type { StorageAdapter } from './StorageAdapter';
import { TauriJsonStorage } from './TauriJsonStorage';

export const storage: StorageAdapter = new TauriJsonStorage();
export type { StorageAdapter };
export { STORAGE_FILES } from './files';
