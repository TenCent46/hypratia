import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import type { Attachment, ID } from '../../types';

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
