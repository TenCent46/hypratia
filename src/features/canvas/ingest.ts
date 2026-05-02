import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import type { Attachment, ID } from '../../types';
import { htmlToMarkdown } from '../../services/markdown/htmlToMarkdown';
import { defaultMarkdownNodeSize } from './MarkdownNode';
import { resolveMarkdownRoot, markdownFiles } from '../../services/storage/MarkdownFileService';
import { ensureNodeMarkdownPath } from '../../services/markdown/MarkdownContextResolver';
import { isMirrorManagedPath } from '../../services/knowledge/knowledgeBaseLayout';

export type IngestedCanvasFile = {
  attachment: Attachment;
  preview: boolean;
  title: string;
};

const MIME_BY_EXT: Record<string, string> = {
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  md: 'text/markdown',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

function extFromName(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function isPreviewableDocument(file: File): boolean {
  const ext = extFromName(file.name);
  if (
    [
      'csv',
      'doc',
      'docx',
      'md',
      'ppt',
      'pptx',
      'txt',
      'xlsx',
    ].includes(ext)
  ) {
    return true;
  }
  return file.type.startsWith('text/');
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extFromName(file.name));
}

function fitImageNodeSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } {
  const fallback = { width: 320, height: 220 };
  if (!width || !height || width <= 0 || height <= 0) return fallback;
  const maxWidth = 420;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(160, Math.round(width * scale)),
    height: Math.max(120, Math.round(height * scale)),
  };
}

export async function ingestDroppedFiles(
  files: File[],
  conversationId: ID,
  position: { x: number; y: number },
): Promise<IngestedCanvasFile[]> {
  const { addAttachment, addNode } = useStore.getState();
  const ingested: IngestedCanvasFile[] = [];

  let i = 0;
  for (const file of files) {
    const isImage = isImageFile(file);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isDoc = isPreviewableDocument(file);
    if (!isImage && !isPdf && !isDoc) continue;
    const ext = extFromName(file.name);
    const title = file.name || (isPdf ? 'PDF' : isImage ? 'image' : 'file');

    const buf = await file.arrayBuffer();
    const att = await attachments.ingest({
      kind: 'bytes',
      bytes: new Uint8Array(buf),
      suggestedName: file.name || (isPdf ? 'document.pdf' : 'file'),
      mimeType:
        file.type ||
        (isPdf
          ? 'application/pdf'
          : MIME_BY_EXT[ext] ?? 'application/octet-stream'),
      conversationId,
    });

    if (isPdf) {
      const pageCount = await readPdfPageCount(att);
      if (pageCount) att.pageCount = pageCount;
    }

    addAttachment(att);
    const imageSize = isImage ? fitImageNodeSize(att.width, att.height) : null;
    addNode({
      conversationId,
      kind: isPdf ? 'pdf' : isImage ? 'image' : 'artifact',
      title,
      contentMarkdown: '',
      position: { x: position.x + i * 24, y: position.y + i * 24 },
      ...(imageSize ? imageSize : {}),
      tags: [isPdf ? 'pdf' : isImage ? 'image' : `file:${ext || 'unknown'}`],
      attachmentIds: [att.id],
    });
    ingested.push({
      attachment: att,
      preview: !isImage,
      title,
    });
    i += 1;
  }
  return ingested;
}

function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

/**
 * Persist a freshly-pasted markdown node's content to the vault as a .md file
 * (same flow MarkdownNode.saveDraft uses on Cmd+Enter / outside-click). The
 * write is best-effort — failures are logged but never throw, since the node
 * is already in the in-memory store and will be picked up by the JSON snapshot.
 */
async function persistMarkdownNodeToVault(nodeId: ID): Promise<void> {
  try {
    const state = useStore.getState();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== 'markdown') return;
    const content = node.contentMarkdown;
    if (!content.trim()) return;
    const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
    const path = await ensureNodeMarkdownPath(rootPath, nodeId);
    if (path && !isMirrorManagedPath(path)) {
      await markdownFiles.writeFile(rootPath, path, content);
    }
  } catch (err) {
    console.warn('[paste] failed to persist .md to vault', err);
  }
}

type ClipboardPayload = {
  files: File[];
  html: string;
  text: string;
};

function payloadFromEvent(data: DataTransfer): ClipboardPayload {
  return {
    files: Array.from(data.files),
    html: data.getData('text/html'),
    text: data.getData('text/plain'),
  };
}

/**
 * Read the current clipboard via the async Clipboard API. Used by the
 * right-click "Paste" menu where we don't have a synchronous ClipboardEvent.
 * Falls back to readText() when read() is denied (some browsers gate the
 * richer API behind a permission prompt).
 */
async function payloadFromAsyncClipboard(): Promise<ClipboardPayload> {
  const out: ClipboardPayload = { files: [], html: '', text: '' };
  if (!navigator.clipboard) return out;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const t of item.types) {
        if (t.startsWith('image/')) {
          const blob = await item.getType(t);
          const ext = t.split('/')[1] ?? 'png';
          out.files.push(
            new File([blob], `pasted-${Date.now()}.${ext}`, { type: t }),
          );
        } else if (t === 'text/html' && !out.html) {
          const blob = await item.getType(t);
          out.html = await blob.text();
        } else if (t === 'text/plain' && !out.text) {
          const blob = await item.getType(t);
          out.text = await blob.text();
        }
      }
    }
  } catch {
    try {
      out.text = await navigator.clipboard.readText();
    } catch (err) {
      console.warn('[paste] clipboard not accessible', err);
    }
  }
  return out;
}

export type PasteSource =
  | { kind: 'event'; data: DataTransfer }
  | { kind: 'async' };

export type PasteResult = {
  /** Number of nodes created. 0 means clipboard had nothing usable. */
  created: number;
  kind: 'files' | 'markdown' | 'text' | 'none';
};

/**
 * Drop clipboard contents onto the canvas as one or more nodes. Image / PDF /
 * doc files become the same node types `ingestDroppedFiles` produces; HTML is
 * converted to Markdown via turndown so bold / lists / code survive; plain
 * text falls back to a Markdown node with the raw text.
 */
export async function pasteToCanvas(
  source: PasteSource,
  conversationId: ID,
  position: { x: number; y: number },
): Promise<PasteResult> {
  const payload =
    source.kind === 'event'
      ? payloadFromEvent(source.data)
      : await payloadFromAsyncClipboard();

  if (payload.files.length > 0) {
    const ingested = await ingestDroppedFiles(
      payload.files,
      conversationId,
      position,
    );
    return { created: ingested.length, kind: 'files' };
  }

  const md = payload.html.trim() ? await htmlToMarkdown(payload.html) : '';
  const kind: 'markdown' | 'text' = md ? 'markdown' : 'text';
  const content = (md || payload.text).trim();
  if (!content) return { created: 0, kind: 'none' };

  const { addNode } = useStore.getState();
  const size = defaultMarkdownNodeSize(content);
  const node = addNode({
    conversationId,
    kind: 'markdown',
    title: deriveTitle(content),
    contentMarkdown: content,
    position,
    width: size.width,
    height: size.height,
    tags: ['pasted'],
  });
  void persistMarkdownNodeToVault(node.id);
  return { created: 1, kind };
}

async function readPdfPageCount(att: Attachment): Promise<number | null> {
  try {
    const [pdfjs, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    const bytes = await attachments.readBytes(att);
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch {
    return null;
  }
}
