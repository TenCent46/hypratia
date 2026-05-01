import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  copyFile,
  exists,
  mkdir,
  readFile,
  remove,
  writeFile,
} from '@tauri-apps/plugin-fs';
import type { Attachment } from '../../types';
import type { AttachmentService, IngestSource } from './AttachmentService';

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

  async ingest(source: IngestSource): Promise<Attachment> {
    const baseDir = await this.baseDir();
    const bucket = monthBucket();
    const bucketDir = await join(baseDir, ATTACH_DIR, bucket);
    if (!(await exists(bucketDir))) await mkdir(bucketDir, { recursive: true });

    const id = nano(16);
    let mimeType: string;
    let bytes: number;
    let absPath: string;

    if (source.kind === 'path') {
      const suggestedName =
        source.suggestedName ?? source.path.split(/[\\/]/).pop() ?? 'file';
      const ext = extFromName(suggestedName);
      mimeType = mimeFromExt(ext);
      const filename = `${id}.${ext}`;
      absPath = await join(bucketDir, filename);
      await copyFile(source.path, absPath);
      const buf = await readFile(absPath);
      bytes = buf.byteLength;
    } else {
      mimeType = source.mimeType;
      const ext = extFromName(source.suggestedName) || mimeType.split('/')[1] || 'bin';
      const filename = `${id}.${ext}`;
      absPath = await join(bucketDir, filename);
      await writeFile(absPath, source.bytes);
      bytes = source.bytes.byteLength;
    }

    const filename = absPath.split(/[\\/]/).pop() ?? `${id}.bin`;
    const relPath = `${ATTACH_DIR}/${bucket}/${filename}`;
    const att: Attachment = {
      id,
      kind: kindFromMime(mimeType),
      filename,
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
    const baseDir = await this.baseDir();
    const path = await join(baseDir, att.relPath);
    if (await exists(path)) {
      await remove(path);
    }
  }

  async toUrl(att: Attachment): Promise<string> {
    const baseDir = await this.baseDir();
    const path = await join(baseDir, att.relPath);
    return convertFileSrc(path);
  }

  async resolveAbsolutePath(att: Attachment): Promise<string> {
    const baseDir = await this.baseDir();
    return join(baseDir, att.relPath);
  }

  async readBytes(att: Attachment): Promise<Uint8Array> {
    const baseDir = await this.baseDir();
    const path = await join(baseDir, att.relPath);
    const buf = await readFile(path);
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }
}
