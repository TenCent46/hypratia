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
  md: 'text/markdown',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

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

export async function ingestDroppedFiles(
  files: File[],
  conversationId: ID,
  position: { x: number; y: number },
): Promise<IngestedCanvasFile[]> {
  const { addAttachment, addNode } = useStore.getState();
  const ingested: IngestedCanvasFile[] = [];

  let i = 0;
  for (const file of files) {
    const isImage = file.type.startsWith('image/');
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
        (isPdf ? 'application/pdf' : MIME_BY_EXT[ext] ?? 'application/octet-stream'),
      conversationId,
    });

    if (isPdf) {
      const pageCount = await readPdfPageCount(att);
      if (pageCount) att.pageCount = pageCount;
    }

    addAttachment(att);
    addNode({
      conversationId,
      kind: isPdf ? 'pdf' : isImage ? 'image' : 'artifact',
      title,
      contentMarkdown: '',
      position: { x: position.x + i * 24, y: position.y + i * 24 },
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
    const url = await attachments.toUrl(att);
    const doc = await pdfjs.getDocument(url).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch {
    return null;
  }
}
