import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  copyFile,
  exists,
  mkdir,
  readFile,
  remove,
  rename,
  writeFile,
} from '@tauri-apps/plugin-fs';
import type { Attachment, AttachmentStorageRoot } from '../../types';
import type { AttachmentService, IngestSource } from './AttachmentService';
import { useStore } from '../../store';
import {
  absoluteMarkdownPath,
  ensureFolderPath,
  resolveMarkdownRoot,
} from '../storage/MarkdownFileService';
import {
  PROJECT_RAW_DIR,
  ROOT_RAW_DIR,
  projectBasePath,
} from '../knowledge/knowledgeBaseLayout';
import { slugify } from '../export/filenames';

const ATTACH_DIR = 'attachments';

function extFromName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : 'bin';
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'pdf': return 'application/pdf';
    case 'csv': return 'text/csv';
    case 'txt': return 'text/plain';
    case 'md':
    case 'markdown': return 'text/markdown';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'video/mp4';
    default: return 'application/octet-stream';
  }
}

function kindFromMime(mime: string): Attachment['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

function monthBucket(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function nano(n = 16): string {
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  for (let i = 0; i < n; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

async function readImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function safeFilename(name: string, fallbackExt: string): string {
  const trimmed = name.trim().replace(/[\\/]/g, '_');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return `untitled.${fallbackExt}`;
  }
  // Reject Windows-reserved device names even on macOS so the vault stays
  // portable across OSes.
  const stem = trimmed.replace(/\.[^.]+$/, '');
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(stem)) return `_${trimmed}`;
  return trimmed;
}

async function uniqueTargetName(
  rootPath: string,
  rawDir: string,
  desired: string,
): Promise<string> {
  // Avoid clobbering an existing file (which may be a user-renamed copy or
  // a different upload that happens to share the same name). The first
  // collision becomes `name (2).ext`, then `(3)`, etc.
  const dot = desired.lastIndexOf('.');
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';
  let candidate = desired;
  let i = 2;
  while (true) {
    const target = await absoluteMarkdownPath(rootPath, `${rawDir}/${candidate}`);
    if (!(await exists(target))) return candidate;
    candidate = `${stem} (${i})${ext}`;
    i += 1;
    if (i > 999) return `${stem}--${slugify(stem) || 'copy'}${ext}`;
  }
}

type IngestTarget =
  | { kind: 'vault'; rootPath: string; rawDir: string }
  | { kind: 'appData' };

// Decide whether a fresh attachment should land in the user's vault (the
// new canonical store) or fall back to the legacy `appData/attachments/`
// path. The only reason to choose appData is the explicit "incognito
// unprojected chats" opt-out — everything else is vault-canonical.
async function decideIngestTarget(source: IngestSource): Promise<IngestTarget> {
  const state = useStore.getState();
  const convId = source.conversationId ?? state.settings.lastConversationId;
  const conv = convId
    ? state.conversations.find((c) => c.id === convId)
    : undefined;

  if (state.settings.incognitoUnprojectedChats && !source.forceRawMirror) {
    if (!conv?.projectId) {
      return { kind: 'appData' };
    }
  }

  try {
    const project = conv?.projectId
      ? state.projects.find((p) => p.id === conv.projectId)
      : undefined;
    const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
    const rawDir = project
      ? `${projectBasePath(project)}/${PROJECT_RAW_DIR}`
      : ROOT_RAW_DIR;
    await ensureFolderPath(rootPath, rawDir);
    return { kind: 'vault', rootPath, rawDir };
  } catch (err) {
    // Vault unreachable (folder removed, permissions, …). Fall back so the
    // ingest still succeeds; the record will be tagged `appData` and read
    // path stays consistent.
    console.warn(
      'attachment ingest: vault target unavailable, falling back to appData',
      err,
    );
    return { kind: 'appData' };
  }
}

async function atomicWriteFromSource(
  target: string,
  source: IngestSource,
): Promise<number> {
  const tmp = `${target}.tmp`;
  if (source.kind === 'path') {
    await copyFile(source.path, tmp);
  } else {
    await writeFile(tmp, source.bytes);
  }
  await rename(tmp, target);
  const buf = await readFile(target);
  return buf.byteLength;
}

export class TauriAttachmentService implements AttachmentService {
  private base: string | null = null;

  private async baseDir(): Promise<string> {
    if (this.base !== null) return this.base;
    const dir = await appDataDir();
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    const adir = await join(dir, ATTACH_DIR);
    if (!(await exists(adir))) await mkdir(adir, { recursive: true });
    this.base = dir;
    return dir;
  }

  // Single point of resolution: every read API delegates here so the
  // `storageRoot` discriminator is honored consistently.
  private async resolvePath(att: Attachment): Promise<string> {
    const root: AttachmentStorageRoot = att.storageRoot ?? 'appData';
    switch (root) {
      case 'vault': {
        const rootPath = await resolveMarkdownRoot(
          useStore.getState().settings.markdownStorageDir,
        );
        return absoluteMarkdownPath(rootPath, att.relPath);
      }
      case 'appData': {
        const baseDir = await this.baseDir();
        return join(baseDir, att.relPath);
      }
      case 'external':
        throw new Error(
          'attachment storageRoot "external" is not supported yet',
        );
    }
  }

  async ingest(source: IngestSource): Promise<Attachment> {
    const target = await decideIngestTarget(source);
    const id = nano(16);

    const rawSuggested =
      source.kind === 'path'
        ? source.suggestedName ?? source.path.split(/[\\/]/).pop() ?? 'file'
        : source.suggestedName;

    if (target.kind === 'vault') {
      const ext =
        extFromName(rawSuggested) ||
        (source.kind === 'bytes' ? source.mimeType.split('/')[1] : '') ||
        'bin';
      const mimeType =
        source.kind === 'bytes' ? source.mimeType : mimeFromExt(ext);
      const safe = safeFilename(rawSuggested || `untitled.${ext}`, ext);
      const finalName = await uniqueTargetName(
        target.rootPath,
        target.rawDir,
        safe,
      );
      const relPath = `${target.rawDir}/${finalName}`;
      const absPath = await absoluteMarkdownPath(target.rootPath, relPath);
      const bytes = await atomicWriteFromSource(absPath, source);

      const att: Attachment = {
        id,
        kind: kindFromMime(mimeType),
        filename: finalName,
        storageRoot: 'vault',
        relPath,
        mimeType,
        bytes,
        createdAt: new Date().toISOString(),
      };

      if (att.kind === 'image') {
        try {
          const url = convertFileSrc(absPath);
          const dim = await readImageDimensions(url);
          if (dim) {
            att.width = dim.width;
            att.height = dim.height;
          }
        } catch {
          // best-effort
        }
      }

      return att;
    }

    // Legacy appData path — preserved for the incognito-unprojected opt-out
    // and as a hard fallback when the vault root is unreachable. Records
    // written here keep the historical `attachments/YYYY-MM/<nanoid>.<ext>`
    // layout so a follow-up migration PR can find them.
    const baseDir = await this.baseDir();
    const bucket = monthBucket();
    const bucketDir = await join(baseDir, ATTACH_DIR, bucket);
    if (!(await exists(bucketDir))) await mkdir(bucketDir, { recursive: true });

    let mimeType: string;
    let bytes: number;
    let absPath: string;

    if (source.kind === 'path') {
      const ext = extFromName(rawSuggested);
      mimeType = mimeFromExt(ext);
      const filename = `${id}.${ext}`;
      absPath = await join(bucketDir, filename);
      await copyFile(source.path, absPath);
      const buf = await readFile(absPath);
      bytes = buf.byteLength;
    } else {
      mimeType = source.mimeType;
      const ext =
        extFromName(source.suggestedName) || mimeType.split('/')[1] || 'bin';
      const filename = `${id}.${ext}`;
      absPath = await join(bucketDir, filename);
      await writeFile(absPath, source.bytes);
      bytes = source.bytes.byteLength;
    }

    const storageName = absPath.split(/[\\/]/).pop() ?? `${id}.bin`;
    const relPath = `${ATTACH_DIR}/${bucket}/${storageName}`;
    const ext = extFromName(rawSuggested) || extFromName(storageName) || 'bin';
    const displayFilename = safeFilename(rawSuggested || storageName, ext);
    const att: Attachment = {
      id,
      kind: kindFromMime(mimeType),
      filename: displayFilename,
      storageRoot: 'appData',
      relPath,
      mimeType,
      bytes,
      createdAt: new Date().toISOString(),
    };

    if (att.kind === 'image') {
      try {
        const url = convertFileSrc(absPath);
        const dim = await readImageDimensions(url);
        if (dim) {
          att.width = dim.width;
          att.height = dim.height;
        }
      } catch {
        // best-effort
      }
    }

    return att;
  }

  async removeByAttachment(att: Attachment): Promise<void> {
    const path = await this.resolvePath(att);
    if (await exists(path)) {
      await remove(path);
    }
  }

  async toUrl(att: Attachment): Promise<string> {
    const path = await this.resolvePath(att);
    return convertFileSrc(path);
  }

  async resolveAbsolutePath(att: Attachment): Promise<string> {
    return this.resolvePath(att);
  }

  async readBytes(att: Attachment): Promise<Uint8Array> {
    const path = await this.resolvePath(att);
    const buf = await readFile(path);
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }
}
