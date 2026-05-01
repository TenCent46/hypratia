import { useStore } from '../../store';
import { attachments } from '../../services/attachments';
import type { Attachment, ID } from '../../types';

export async function ingestDroppedFiles(
  files: File[],
  conversationId: ID,
  position: { x: number; y: number },
): Promise<void> {
  const { addAttachment, addNode } = useStore.getState();

  let i = 0;
  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isImage && !isPdf) continue;

    const buf = await file.arrayBuffer();
    const att = await attachments.ingest({
      kind: 'bytes',
      bytes: new Uint8Array(buf),
      suggestedName: file.name || (isPdf ? 'document.pdf' : 'image'),
      mimeType: file.type || (isPdf ? 'application/pdf' : 'image/png'),
    });

    if (isPdf) {
      const pageCount = await readPdfPageCount(att);
      if (pageCount) att.pageCount = pageCount;
    }

    addAttachment(att);
    addNode({
      conversationId,
      kind: isPdf ? 'pdf' : 'image',
      title: file.name || (isPdf ? 'PDF' : 'image'),
      contentMarkdown: '',
      position: { x: position.x + i * 24, y: position.y + i * 24 },
      tags: [isPdf ? 'pdf' : 'image'],
      attachmentIds: [att.id],
    });
    i += 1;
  }
}

async function readPdfPageCount(att: Attachment): Promise<number | null> {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const url = await attachments.toUrl(att);
    const doc = await pdfjs.getDocument(url).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch {
    return null;
  }
}
