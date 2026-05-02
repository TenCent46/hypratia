export type KnowledgeDocumentRecord = {
  documentId: string;
  projectName: string;
  sourcePath: string;
  title: string;
  extension: string;
  hash: string;
  bytes: number;
  status: 'ok' | 'error';
  error?: string;
  updatedAt: string;
  pageCount: number;
  sentenceCount: number;
  chunkCount: number;
};

export type KnowledgePageRecord = {
  documentId: string;
  pageNumber: number;
  text: string;
};

export type KnowledgeSentenceRecord = {
  documentId: string;
  sentenceIndex: number;
  pageNumber?: number;
  headingPath: string[];
  text: string;
  startOffset: number;
  endOffset: number;
};

export type KnowledgeChunkRecord = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  headingPath: string[];
  pageStart?: number;
  pageEnd?: number;
  sentenceStart: number;
  sentenceEnd: number;
  text: string;
  contextualText: string;
  tokenCount: number;
};

export type ExtractedKnowledgeDocument = {
  projectName: string;
  documentId: string;
  sourcePath: string;
  title: string;
  extension: string;
  hash: string;
  bytes: number;
  extractedAt: string;
  pages: Array<{ pageNumber?: number; text: string }>;
};

export type CanonicalKnowledgeRecords = {
  document: KnowledgeDocumentRecord;
  pages: KnowledgePageRecord[];
  sentences: KnowledgeSentenceRecord[];
  chunks: KnowledgeChunkRecord[];
};

export type KnowledgeSearchResult = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  score: number;
  citation: string;
  pageStart?: number;
  pageEnd?: number;
  sentenceStart: number;
  sentenceEnd: number;
  text: string;
  contextualText: string;
  tokenCount: number;
};

export type LexicalIndexRecord = {
  version: 1;
  kind: 'bm25-json';
  builtAt: string;
  chunkCount: number;
  avgDocumentLength: number;
  documentFrequencies: Record<string, number>;
};

const TARGET_CHUNK_TOKENS = 520;
const MAX_CHUNK_TOKENS = 820;
const OVERLAP_TOKENS = 90;

export function stableKnowledgeId(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 1597334677) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2
    .toString(16)
    .padStart(8, '0')}`;
}

export function estimateTokens(text: string): number {
  const latin = text.match(/[\p{L}\p{N}_'-]+/gu)?.length ?? 0;
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)
    ?.length ?? 0;
  const other = Math.ceil(text.length / 12);
  return Math.max(1, latin + Math.ceil(cjk / 2) + other);
}

export function tokenizeForSearch(text: string): string[] {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const cjkChars =
    normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ??
    [];
  const grams: string[] = [];
  for (let i = 0; i < cjkChars.length - 1; i += 1) {
    grams.push(`${cjkChars[i]}${cjkChars[i + 1]}`);
  }
  return [...words, ...grams].filter((token) => token.length > 1);
}

export function buildCanonicalKnowledgeRecords(
  input: ExtractedKnowledgeDocument,
): CanonicalKnowledgeRecords {
  const pages = input.pages
    .map((page, index) => ({
      documentId: input.documentId,
      pageNumber: page.pageNumber ?? index + 1,
      text: normalizeWhitespace(page.text),
    }))
    .filter((page) => page.text.length > 0);

  const sentences =
    input.extension === 'md' || input.extension === 'markdown'
      ? sentenceRecordsFromMarkdown(input.documentId, pages)
      : sentenceRecordsFromPages(input.documentId, pages);
  const chunks = generateKnowledgeChunks(input, sentences);
  const document: KnowledgeDocumentRecord = {
    documentId: input.documentId,
    projectName: input.projectName,
    sourcePath: input.sourcePath,
    title: input.title,
    extension: input.extension,
    hash: input.hash,
    bytes: input.bytes,
    status: 'ok',
    updatedAt: input.extractedAt,
    pageCount: pages.length,
    sentenceCount: sentences.length,
    chunkCount: chunks.length,
  };
  return { document, pages, sentences, chunks };
}

export function makeErrorDocumentRecord(args: {
  projectName: string;
  documentId: string;
  sourcePath: string;
  title: string;
  extension: string;
  hash: string;
  bytes: number;
  updatedAt: string;
  error: string;
}): KnowledgeDocumentRecord {
  return {
    documentId: args.documentId,
    projectName: args.projectName,
    sourcePath: args.sourcePath,
    title: args.title,
    extension: args.extension,
    hash: args.hash,
    bytes: args.bytes,
    status: 'error',
    error: args.error,
    updatedAt: args.updatedAt,
    pageCount: 0,
    sentenceCount: 0,
    chunkCount: 0,
  };
}

export function buildLexicalIndex(
  chunks: KnowledgeChunkRecord[],
  builtAt = new Date().toISOString(),
): LexicalIndexRecord {
  const df = new Map<string, number>();
  let totalLength = 0;
  for (const chunk of chunks) {
    const unique = new Set(tokenizeForSearch(chunk.contextualText));
    totalLength += unique.size;
    for (const token of unique) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  return {
    version: 1,
    kind: 'bm25-json',
    builtAt,
    chunkCount: chunks.length,
    avgDocumentLength: chunks.length ? totalLength / chunks.length : 0,
    documentFrequencies: Object.fromEntries([...df.entries()].sort()),
  };
}

export function searchKnowledgeChunks(args: {
  query: string;
  chunks: KnowledgeChunkRecord[];
  topK?: number;
  tokenBudget?: number;
}): KnowledgeSearchResult[] {
  const queryTokens = tokenizeForSearch(args.query);
  if (queryTokens.length === 0) return [];

  const chunkTokens = args.chunks.map((chunk) =>
    tokenizeForSearch(chunk.contextualText),
  );
  const index = buildLexicalIndex(args.chunks);
  const avgDl = index.avgDocumentLength || 1;
  const totalDocs = Math.max(1, args.chunks.length);
  const k1 = 1.4;
  const b = 0.72;
  const scored = args.chunks
    .map((chunk, i) => {
      const tokens = chunkTokens[i] ?? [];
      const dl = Math.max(1, tokens.length);
      const tf = new Map<string, number>();
      for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      let score = 0;
      for (const token of queryTokens) {
        const freq = tf.get(token) ?? 0;
        if (!freq) continue;
        const df = index.documentFrequencies[token] ?? 0;
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
        score +=
          idf *
          ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (dl / avgDl))));
      }
      const compactQuery = args.query.trim().toLowerCase();
      if (
        compactQuery.length > 2 &&
        chunk.contextualText.toLowerCase().includes(compactQuery)
      ) {
        score += 2.5;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const results: KnowledgeSearchResult[] = [];
  let usedTokens = 0;
  const topK = args.topK ?? 8;
  const tokenBudget = args.tokenBudget ?? 2400;
  for (const item of scored) {
    if (results.length >= topK) break;
    if (usedTokens + item.chunk.tokenCount > tokenBudget && results.length > 0) {
      break;
    }
    usedTokens += item.chunk.tokenCount;
    results.push({
      chunkId: item.chunk.chunkId,
      documentId: item.chunk.documentId,
      sourcePath: item.chunk.sourcePath,
      title: item.chunk.title,
      score: Number(item.score.toFixed(4)),
      citation: citationForChunk(item.chunk),
      pageStart: item.chunk.pageStart,
      pageEnd: item.chunk.pageEnd,
      sentenceStart: item.chunk.sentenceStart,
      sentenceEnd: item.chunk.sentenceEnd,
      text: item.chunk.text,
      contextualText: item.chunk.contextualText,
      tokenCount: item.chunk.tokenCount,
    });
  }
  return results;
}

export function readKnowledgeRange(args: {
  documentId: string;
  pages: KnowledgePageRecord[];
  sentences: KnowledgeSentenceRecord[];
  pageStart?: number;
  pageEnd?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
}): string {
  if (args.pageStart !== undefined || args.pageEnd !== undefined) {
    const start = args.pageStart ?? args.pageEnd ?? 1;
    const end = args.pageEnd ?? args.pageStart ?? start;
    return args.pages
      .filter(
        (page) =>
          page.documentId === args.documentId &&
          page.pageNumber >= start &&
          page.pageNumber <= end,
      )
      .map((page) => `[[page ${page.pageNumber}]]\n${page.text}`)
      .join('\n\n')
      .trim();
  }

  const start = args.sentenceStart ?? 0;
  const end = args.sentenceEnd ?? start;
  return args.sentences
    .filter(
      (sentence) =>
        sentence.documentId === args.documentId &&
        sentence.sentenceIndex >= start &&
        sentence.sentenceIndex <= end,
    )
    .map((sentence) => sentence.text)
    .join(' ')
    .trim();
}

export function citationForChunk(chunk: KnowledgeChunkRecord): string {
  const filename = chunk.sourcePath.split('/').pop() ?? chunk.title;
  if (chunk.pageStart !== undefined) {
    const page =
      chunk.pageEnd && chunk.pageEnd !== chunk.pageStart
        ? `pp. ${chunk.pageStart}-${chunk.pageEnd}`
        : `p. ${chunk.pageStart}`;
    return `[${filename}, ${page}]`;
  }
  return `[${filename}, sentences ${chunk.sentenceStart}-${chunk.sentenceEnd}]`;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sentenceRecordsFromPages(
  documentId: string,
  pages: KnowledgePageRecord[],
): KnowledgeSentenceRecord[] {
  const out: KnowledgeSentenceRecord[] = [];
  for (const page of pages) {
    const spans = splitSentenceLikeSpans(page.text);
    for (const span of spans) {
      out.push({
        documentId,
        sentenceIndex: out.length,
        pageNumber: page.pageNumber,
        headingPath: [],
        text: span.text,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
      });
    }
  }
  return out;
}

function sentenceRecordsFromMarkdown(
  documentId: string,
  pages: KnowledgePageRecord[],
): KnowledgeSentenceRecord[] {
  const out: KnowledgeSentenceRecord[] = [];
  const headings: string[] = [];
  for (const page of pages) {
    let paragraph = '';
    let paragraphStart = 0;
    let cursor = 0;
    const lines = page.text.split('\n');
    const flush = () => {
      const spans = splitSentenceLikeSpans(paragraph);
      for (const span of spans) {
        out.push({
          documentId,
          sentenceIndex: out.length,
          pageNumber: undefined,
          headingPath: headings.filter(Boolean),
          text: span.text,
          startOffset: paragraphStart + span.startOffset,
          endOffset: paragraphStart + span.endOffset,
        });
      }
      paragraph = '';
    };

    for (const line of lines) {
      const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (heading) {
        flush();
        const depth = heading[1].length;
        headings.length = depth - 1;
        headings[depth - 1] = heading[2].trim();
      } else if (line.trim()) {
        if (!paragraph) paragraphStart = cursor;
        paragraph += paragraph ? `\n${line}` : line;
      } else {
        flush();
      }
      cursor += line.length + 1;
    }
    flush();
  }
  return out;
}

function splitSentenceLikeSpans(
  text: string,
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const out: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  const normalized = normalizeWhitespace(text);
  const re = /[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu;
  for (const match of normalized.matchAll(re)) {
    const raw = match[0] ?? '';
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const start = match.index ?? 0;
    out.push({
      text: value,
      startOffset: start,
      endOffset: start + raw.length,
    });
  }
  if (out.length === 0 && normalized) {
    out.push({
      text: normalized,
      startOffset: 0,
      endOffset: normalized.length,
    });
  }
  return out;
}

function generateKnowledgeChunks(
  input: ExtractedKnowledgeDocument,
  sentences: KnowledgeSentenceRecord[],
): KnowledgeChunkRecord[] {
  const chunks: KnowledgeChunkRecord[] = [];
  let start = 0;
  while (start < sentences.length) {
    let end = start;
    let tokens = 0;
    while (end < sentences.length) {
      const nextTokens = estimateTokens(sentences[end].text);
      if (end > start && tokens + nextTokens > MAX_CHUNK_TOKENS) break;
      tokens += nextTokens;
      end += 1;
      if (tokens >= TARGET_CHUNK_TOKENS) break;
    }
    if (end === start) end += 1;

    const slice = sentences.slice(start, end);
    const text = slice.map((sentence) => sentence.text).join(' ');
    const headingPath = mostRecentHeading(slice);
    const pageNumbers = slice
      .map((sentence) => sentence.pageNumber)
      .filter((page): page is number => page !== undefined);
    const pageStart = pageNumbers.length ? Math.min(...pageNumbers) : undefined;
    const pageEnd = pageNumbers.length ? Math.max(...pageNumbers) : undefined;
    const contextBits = [
      `Source: ${input.title}`,
      pageStart !== undefined
        ? pageEnd !== undefined && pageEnd !== pageStart
          ? `Pages: ${pageStart}-${pageEnd}`
          : `Page: ${pageStart}`
        : '',
      headingPath.length ? `Section: ${headingPath.join(' > ')}` : '',
    ].filter(Boolean);
    const contextualText = `${contextBits.join('\n')}\n\n${text}`;
    chunks.push({
      chunkId: `chunk_${input.documentId}_${chunks.length}`,
      documentId: input.documentId,
      sourcePath: input.sourcePath,
      title: input.title,
      headingPath,
      pageStart,
      pageEnd,
      sentenceStart: slice[0].sentenceIndex,
      sentenceEnd: slice[slice.length - 1].sentenceIndex,
      text,
      contextualText,
      tokenCount: estimateTokens(contextualText),
    });

    if (end >= sentences.length) break;
    let overlap = 0;
    let nextStart = end;
    while (nextStart > start) {
      const sentence = sentences[nextStart - 1];
      overlap += estimateTokens(sentence.text);
      if (overlap >= OVERLAP_TOKENS) break;
      nextStart -= 1;
    }
    start = Math.max(start + 1, nextStart);
  }
  return chunks;
}

function mostRecentHeading(sentences: KnowledgeSentenceRecord[]): string[] {
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    if (sentences[i].headingPath.length > 0) return sentences[i].headingPath;
  }
  return [];
}
