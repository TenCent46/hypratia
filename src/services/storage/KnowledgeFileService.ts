import { join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';

export type KnowledgeDirEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
};

export async function joinKnowledgePath(
  base: string,
  ...segments: string[]
): Promise<string> {
  return join(base, ...segments);
}

export async function knowledgePathExists(path: string): Promise<boolean> {
  return exists(path);
}

export async function ensureKnowledgeDir(path: string): Promise<void> {
  if (!(await exists(path))) await mkdir(path, { recursive: true });
}

export async function readKnowledgeDir(path: string): Promise<KnowledgeDirEntry[]> {
  return readDir(path);
}

export async function readKnowledgeBytes(path: string): Promise<Uint8Array> {
  const value = await readFile(path);
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function readKnowledgeText(path: string): Promise<string> {
  return readTextFile(path);
}

export async function writeKnowledgeText(
  path: string,
  content: string,
): Promise<void> {
  await writeTextFile(path, content);
}
