export type OfficeTextPreview =
  | { ok: true; kind: 'docx'; paragraphs: string[] }
  | { ok: true; kind: 'pptx'; slides: Array<{ index: number; lines: string[] }> }
  | { ok: false; reason: string };

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
};
type DecompressionStreamCtor = new (
  format: string,
) => TransformStream<Uint8Array, Uint8Array>;

const decoder = new TextDecoder('utf-8');

function u16(data: DataView, offset: number): number {
  return data.getUint16(offset, true);
}

function u32(data: DataView, offset: number): number {
  return data.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 0xffff - 22);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

function readEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('ZIP central directory was not found.');
  const total = u16(view, eocd + 10);
  let cursor = u32(view, eocd + 16);
  const entries = new Map<string, ZipEntry>();

  for (let i = 0; i < total; i += 1) {
    if (u32(view, cursor) !== 0x02014b50) break;
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const nameLen = u16(view, cursor + 28);
    const extraLen = u16(view, cursor + 30);
    const commentLen = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
    entries.set(name, { name, method, compressedSize, localOffset });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as typeof globalThis & {
    DecompressionStream?: DecompressionStreamCtor;
  }).DecompressionStream;
  if (!Ctor) {
    throw new Error('Compressed Office preview requires DecompressionStream.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new Ctor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<Uint8Array | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cursor = entry.localOffset;
  if (u32(view, cursor) !== 0x04034b50) return null;
  const nameLen = u16(view, cursor + 26);
  const extraLen = u16(view, cursor + 28);
  const start = cursor + 30 + nameLen + extraLen;
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRaw(compressed);
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

function xmlTextLines(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const lines: string[] = [];
  let current = '';
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.localName === 't') current += el.textContent ?? '';
    if (el.localName === 'p' && current.trim()) {
      lines.push(current.replace(/\s+/g, ' ').trim());
      current = '';
    }
  }
  if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
  return lines;
}

export async function extractOfficeTextPreview(
  bytes: Uint8Array,
  ext: string,
): Promise<OfficeTextPreview> {
  try {
    const entries = readEntries(bytes);
    if (ext === 'docx') {
      const documentXml = await readEntry(bytes, entries, 'word/document.xml');
      if (!documentXml) return { ok: false, reason: 'word/document.xml not found.' };
      return {
        ok: true,
        kind: 'docx',
        paragraphs: xmlTextLines(decoder.decode(documentXml)).slice(0, 500),
      };
    }
    if (ext === 'pptx') {
      const slideNames = Array.from(entries.keys())
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const ai = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
          const bi = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
          return ai - bi;
        });
      const slides: { index: number; lines: string[] }[] = [];
      for (const name of slideNames.slice(0, 80)) {
        const xml = await readEntry(bytes, entries, name);
        if (!xml) continue;
        const index = Number(name.match(/slide(\d+)\.xml/)?.[1] ?? slides.length + 1);
        slides.push({ index, lines: xmlTextLines(decoder.decode(xml)) });
      }
      return { ok: true, kind: 'pptx', slides };
    }
    return { ok: false, reason: `.${ext} preview is not implemented.` };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}
