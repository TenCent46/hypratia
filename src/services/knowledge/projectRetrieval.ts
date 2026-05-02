import {
  ensureKnowledgeDir,
  joinKnowledgePath,
  knowledgePathExists,
  readKnowledgeBytes,
  readKnowledgeDir,
  readKnowledgeText,
  writeKnowledgeText,
} from '../storage/KnowledgeFileService';
import { useStore } from '../../store';
import { extractOfficeTextPreview } from '../preview/officeText';
import { resolveMarkdownRoot, writeMarkdownFileEnsuringDirs } from '../storage/MarkdownFileService';
import {
  defaultMetaInstructionPath,
  defaultProcessedPath,
  PROJECT_RAW_DIR,
  projectBasePath,
  projectMetaInstructionPath,
  projectProcessedPath,
  projectRawPath,
  safeBaseSlug,
} from './knowledgeBaseLayout';
import {
  buildCanonicalKnowledgeRecords,
  buildLexicalIndex,
  citationForChunk,
  makeErrorDocumentRecord,
  readKnowledgeRange,
  searchKnowledgeChunks,
  stableKnowledgeId,
  type KnowledgeChunkRecord,
  type KnowledgeDocumentRecord,
  type KnowledgePageRecord,
  type KnowledgeSearchResult,
  type KnowledgeSentenceRecord,
} from './projectRetrievalCore';
import {
  decodeHeadingPath,
  ftsIndexReplace,
  ftsIndexSearch,
  type FtsSearchResult,
} from '../storage/fts5Index';
import type { Project } from '../../types';

export const DEFAULT_META_INSTRUCTION = [
  'You are operating inside a project-specific chat.',
  'The project may contain raw documents in the project raw folder.',
  'Do not assume those documents are already in context.',
  'For any project-specific factual claim, search the project knowledge first.',
  'Use retrieved snippets as evidence.',
  'When exact wording matters, request the original page or sentence range.',
  'If the answer is not found in the project knowledge, say so clearly.',
  'Do not invent citations or pretend to have read documents that were not retrieved.',
].join('\n');

export type ProjectKnowledgeSearchArgs = {
  projectName?: string;
  query: string;
  topK?: number;
  tokenBudget?: number;
};

export type ProjectKnowledgeReadRangeArgs = {
  projectName?: string;
  documentId: string;
  pageStart?: number;
  pageEnd?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
};

export type ProjectKnowledgeSearchResponse = {
  projectName: string;
  processedDir: string;
  results: KnowledgeSearchResult[];
};

export type ProjectKnowledgeReadRangeResponse = {
  projectName: string;
  documentId: string;
  citation: string;
  text: string;
};

export type ProjectKnowledgeIngestionResult = {
  projectName: string;
  rawDir: string;
  processedDir: string;
  scanned: number;
  processed: number;
  unchanged: number;
  deleted: number;
  errors: Array<{ sourcePath: string; error: string }>;
};

type KnowledgeTarget = {
  projectName: string;
  project?: Project;
  rawDir: string;
  processedDir: string;
  metaInstructionPath: string;
};

type RawKnowledgeFile = {
  sourcePath: string;
  absPath: string;
  title: string;
  extension: string;
  bytes: Uint8Array;
  hash: string;
};

type ProcessedFiles = {
  documents: string;
  pages: string;
  sentences: string;
  chunks: string;
  summaries: string;
  index: string;
  vectorManifest: string;
};

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'text', 'csv', 'json']);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, 'pdf', 'docx']);

export type RebuildProjectKnowledgeOptions = {
  /**
   * When true, every raw file is re-extracted and re-chunked from
   * scratch even if its SHA-256 hash matches the previously indexed
   * record. The default (false) reuses unchanged documents, which is
   * the cheap path the chat-send pipeline relies on. Use `true` when
   * the user manually invokes "Rebuild project knowledge index" — at
   * that point we should trust the user's intent over the cache.
   */
  force?: boolean;
};

export async function rebuildProjectKnowledge(
  projectName?: string,
  opts: RebuildProjectKnowledgeOptions = {},
): Promise<ProjectKnowledgeIngestionResult> {
  return rebuildTargetKnowledge(targetForProjectName(projectName), opts);
}

async function rebuildTargetKnowledge(
  target: KnowledgeTarget,
  opts: RebuildProjectKnowledgeOptions = {},
): Promise<ProjectKnowledgeIngestionResult> {
  const rootPath = await currentRootPath();
  await ensureProjectMetaInstruction(target);
  const processed = await processedFiles(rootPath, target.processedDir);
  const rawFiles = await scanRawFiles(rootPath, target.rawDir);
  const previousDocuments = await readJson<KnowledgeDocumentRecord[]>(
    processed.documents,
    [],
  );
  const previousPages = await readJsonl<KnowledgePageRecord>(processed.pages);
  const previousSentences = await readJsonl<KnowledgeSentenceRecord>(
    processed.sentences,
  );
  const previousChunks = await readJsonl<KnowledgeChunkRecord>(processed.chunks);
  const previousByPath = new Map(
    previousDocuments.map((document) => [document.sourcePath, document]),
  );
  const activePaths = new Set(rawFiles.map((file) => file.sourcePath));

  const documents: KnowledgeDocumentRecord[] = [];
  const pages: KnowledgePageRecord[] = [];
  const sentences: KnowledgeSentenceRecord[] = [];
  const chunks: KnowledgeChunkRecord[] = [];
  const errors: Array<{ sourcePath: string; error: string }> = [];
  let changed = 0;
  let unchanged = 0;

  for (const file of rawFiles) {
    const previous = previousByPath.get(file.sourcePath);
    if (!opts.force && previous?.hash === file.hash) {
      documents.push(previous);
      pages.push(
        ...previousPages.filter((page) => page.documentId === previous.documentId),
      );
      sentences.push(
        ...previousSentences.filter(
          (sentence) => sentence.documentId === previous.documentId,
        ),
      );
      chunks.push(
        ...previousChunks.filter((chunk) => chunk.documentId === previous.documentId),
      );
      unchanged += 1;
      if (previous.status === 'error' && previous.error) {
        errors.push({ sourcePath: previous.sourcePath, error: previous.error });
      }
      continue;
    }

    changed += 1;
    const documentId = `doc_${stableKnowledgeId(file.sourcePath)}`;
    const updatedAt = new Date().toISOString();
    try {
      const extracted = await extractRawDocument(file, {
        projectName: target.projectName,
        documentId,
        extractedAt: updatedAt,
      });
      const records = buildCanonicalKnowledgeRecords(extracted);
      documents.push(records.document);
      pages.push(...records.pages);
      sentences.push(...records.sentences);
      chunks.push(...records.chunks);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      documents.push(
        makeErrorDocumentRecord({
          projectName: target.projectName,
          documentId,
          sourcePath: file.sourcePath,
          title: file.title,
          extension: file.extension,
          hash: file.hash,
          bytes: file.bytes.byteLength,
          updatedAt,
          error,
        }),
      );
      errors.push({ sourcePath: file.sourcePath, error });
      console.warn('[knowledge] extraction failed', file.sourcePath, err);
    }
  }

  documents.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  chunks.sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  await writeKnowledgeText(processed.documents, JSON.stringify(documents, null, 2));
  await writeKnowledgeText(processed.pages, toJsonl(pages));
  await writeKnowledgeText(processed.sentences, toJsonl(sentences));
  await writeKnowledgeText(processed.chunks, toJsonl(chunks));
  await writeKnowledgeText(processed.summaries, toJsonl(makeSummaries(documents)));
  // Keep the JSON BM25 sidecar as a graceful-fallback / debug artifact;
  // SQLite FTS5 is the primary index now (see below), and search reads
  // from FTS first. The JSON file lets the project still answer queries
  // if the SQLite write fails (corrupt vault, missing FS permission, …).
  await writeKnowledgeText(
    processed.index,
    JSON.stringify(buildLexicalIndex(chunks), null, 2),
  );
  // Push every chunk into the SQLite FTS5 table. `replace` semantics
  // (delete-then-insert inside one tx) on the Rust side keep the index
  // exactly in sync with the JSONL chunks file. Fail-soft: if FTS5
  // breaks for any reason we still have the JSON sidecar above.
  let ftsChunksWritten: number | null = null;
  try {
    ftsChunksWritten = await ftsIndexReplace(
      rootPath,
      target.processedDir,
      chunks,
    );
  } catch (err) {
    console.warn('[knowledge] FTS5 index replace failed', err);
    errors.push({
      sourcePath: 'fts5:index',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  await writeKnowledgeText(
    processed.vectorManifest,
    JSON.stringify(
      {
        version: 1,
        status: 'not-built',
        reason:
          'Lexical retrieval is handled by SQLite FTS5 (index.sqlite). Vector search is a future phase.',
      },
      null,
      2,
    ),
  );

  const deleted = previousDocuments.filter(
    (document) => !activePaths.has(document.sourcePath),
  ).length;
  console.info('[knowledge] project indexed', {
    projectName: target.projectName,
    scanned: rawFiles.length,
    changed,
    unchanged,
    deleted,
    errors: errors.length,
    ftsChunksWritten,
  });
  return {
    projectName: target.projectName,
    rawDir: target.rawDir,
    processedDir: target.processedDir,
    scanned: rawFiles.length,
    processed: changed,
    unchanged,
    deleted,
    errors,
  };
}

export async function searchProjectKnowledge(
  args: ProjectKnowledgeSearchArgs,
): Promise<ProjectKnowledgeSearchResponse> {
  const target = targetForProjectName(args.projectName);
  return searchTargetKnowledge(target, args);
}

export async function readDocumentRange(
  args: ProjectKnowledgeReadRangeArgs,
): Promise<ProjectKnowledgeReadRangeResponse> {
  const target = targetForProjectName(args.projectName);
  return readTargetDocumentRange(target, args);
}

export async function searchConversationProjectKnowledge(
  conversationId: string,
  args: Omit<ProjectKnowledgeSearchArgs, 'projectName'>,
): Promise<ProjectKnowledgeSearchResponse> {
  const target = targetForConversation(conversationId);
  return searchTargetKnowledge(target, args);
}

export async function readConversationProjectDocumentRange(
  conversationId: string,
  args: Omit<ProjectKnowledgeReadRangeArgs, 'projectName'>,
): Promise<ProjectKnowledgeReadRangeResponse> {
  const target = targetForConversation(conversationId);
  return readTargetDocumentRange(target, args);
}

export async function ensureProjectMetaInstructionForProject(
  projectName?: string,
): Promise<void> {
  await ensureProjectMetaInstruction(targetForProjectName(projectName));
}

async function searchTargetKnowledge(
  target: KnowledgeTarget,
  args: Omit<ProjectKnowledgeSearchArgs, 'projectName'>,
): Promise<ProjectKnowledgeSearchResponse> {
  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rootPath = await currentRootPath();
  await rebuildTargetKnowledge(target);
  const files = await processedFiles(rootPath, target.processedDir);
  // Try SQLite FTS5 first — that's the primary index. Fall back to the
  // JSON BM25 implementation only when FTS5 errors (corrupt vault, fs
  // permission glitch, etc.) so search keeps working even when the DB
  // path is broken. The JSON sidecar is regenerated on every rebuild
  // so it's never more than a few seconds stale.
  const topK = args.topK;
  const tokenBudget = args.tokenBudget;
  let chunksSearched: number;
  let backend: 'fts5' | 'bm25-json' = 'fts5';
  let response: ProjectKnowledgeSearchResponse;
  try {
    const ftsResults = await ftsIndexSearch(
      rootPath,
      target.processedDir,
      args.query,
      topK ?? 20,
    );
    chunksSearched = ftsResults.length;
    const results = ftsResultsToSearchResults(ftsResults, tokenBudget);
    response = {
      projectName: target.projectName,
      processedDir: target.processedDir,
      results,
    };
  } catch (err) {
    console.warn(
      '[knowledge] FTS5 search failed; falling back to JSON BM25',
      err,
    );
    backend = 'bm25-json';
    const chunks = await readJsonl<KnowledgeChunkRecord>(files.chunks);
    chunksSearched = chunks.length;
    response = {
      projectName: target.projectName,
      processedDir: target.processedDir,
      results: searchKnowledgeChunks({
        query: args.query,
        chunks,
        topK,
        tokenBudget,
      }),
    };
  }
  const elapsedMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  );
  // Local-only retrieval observability. Stable line shape so users can
  // grep `[mc:retrieval]` in devtools to inspect search behaviour
  // without needing external telemetry. No data leaves the machine.
  console.info('[mc:retrieval] knowledge_search', {
    query: args.query,
    projectName: target.projectName,
    backend,
    chunksSearched,
    topKRequested: topK ?? 20,
    topKReturned: response.results.length,
    tokenBudget: tokenBudget ?? null,
    elapsedMs,
    readDocumentRangeCalled: false,
  });
  return response;
}

/**
 * Map the Rust FTS5 row shape into the existing
 * `KnowledgeSearchResult` shape so callers don't need to know which
 * backend ran. Optionally trims by `tokenBudget` so very long
 * retrievals don't blow up the chat context window.
 */
function ftsResultsToSearchResults(
  rows: FtsSearchResult[],
  tokenBudget?: number,
): KnowledgeSearchResult[] {
  const out: KnowledgeSearchResult[] = [];
  let used = 0;
  const budget = tokenBudget ?? 2400;
  for (const r of rows) {
    const chunk: KnowledgeChunkRecord = {
      chunkId: r.chunkId,
      documentId: r.documentId,
      sourcePath: r.sourcePath,
      title: r.title,
      headingPath: decodeHeadingPath(r.headingPath),
      pageStart: r.pageStart ?? undefined,
      pageEnd: r.pageEnd ?? undefined,
      sentenceStart: r.sentenceStart ?? 0,
      sentenceEnd: r.sentenceEnd ?? 0,
      text: r.text,
      contextualText: r.contextualText ?? r.text,
      tokenCount: r.tokenCount ?? 0,
    };
    if (used + chunk.tokenCount > budget && out.length > 0) {
      break;
    }
    used += chunk.tokenCount;
    out.push({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      sourcePath: chunk.sourcePath,
      title: chunk.title,
      score: Number(r.score.toFixed(4)),
      citation: citationForChunk(chunk),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sentenceStart: chunk.sentenceStart,
      sentenceEnd: chunk.sentenceEnd,
      text: chunk.text,
      contextualText: chunk.contextualText,
      tokenCount: chunk.tokenCount,
    });
  }
  return out;
}

async function readTargetDocumentRange(
  target: KnowledgeTarget,
  args: Omit<ProjectKnowledgeReadRangeArgs, 'projectName'>,
): Promise<ProjectKnowledgeReadRangeResponse> {
  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rootPath = await currentRootPath();
  await rebuildTargetKnowledge(target);
  const files = await processedFiles(rootPath, target.processedDir);
  const documents = await readJson<KnowledgeDocumentRecord[]>(files.documents, []);
  const pages = await readJsonl<KnowledgePageRecord>(files.pages);
  const sentences = await readJsonl<KnowledgeSentenceRecord>(files.sentences);
  const document = documents.find((item) => item.documentId === args.documentId);
  const text = readKnowledgeRange({
    documentId: args.documentId,
    pages,
    sentences,
    pageStart: args.pageStart,
    pageEnd: args.pageEnd,
    sentenceStart: args.sentenceStart,
    sentenceEnd: args.sentenceEnd,
  });
  const source = document?.sourcePath.split('/').pop() ?? args.documentId;
  const citation =
    args.pageStart !== undefined || args.pageEnd !== undefined
      ? `[${source}, p. ${args.pageStart ?? args.pageEnd}]`
      : `[${source}, sentences ${args.sentenceStart ?? 0}-${args.sentenceEnd ?? args.sentenceStart ?? 0}]`;
  const elapsedMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  );
  console.info('[mc:retrieval] readDocumentRange', {
    projectName: target.projectName,
    documentId: args.documentId,
    pageStart: args.pageStart ?? null,
    pageEnd: args.pageEnd ?? null,
    sentenceStart: args.sentenceStart ?? null,
    sentenceEnd: args.sentenceEnd ?? null,
    textLength: text.length,
    elapsedMs,
  });
  return {
    projectName: target.projectName,
    documentId: args.documentId,
    citation,
    text,
  };
}

async function ensureProjectMetaInstruction(target: KnowledgeTarget): Promise<void> {
  const rootPath = await currentRootPath();
  try {
    const abs = await joinKnowledgePath(rootPath, target.metaInstructionPath);
    if (await knowledgePathExists(abs)) return;
    await writeMarkdownFileEnsuringDirs(
      rootPath,
      target.metaInstructionPath,
      DEFAULT_META_INSTRUCTION,
    );
  } catch (err) {
    console.warn('[knowledge] failed to ensure meta-instruction.md', err);
  }
}

function targetForConversation(conversationId: string): KnowledgeTarget {
  const state = useStore.getState();
  const conversation = state.conversations.find((item) => item.id === conversationId);
  const project = conversation?.projectId
    ? state.projects.find((item) => item.id === conversation.projectId)
    : undefined;
  return targetFromProject(project);
}

function targetForProjectName(projectName: string | undefined): KnowledgeTarget {
  const state = useStore.getState();
  const normalized = projectName?.trim();
  const project = normalized
    ? state.projects.find(
        (item) =>
          item.name === normalized ||
          safeBaseSlug(item.name) === normalized ||
          projectBasePath(item) === normalized,
      )
    : undefined;
  return targetFromProject(project);
}

function targetFromProject(project: Project | undefined): KnowledgeTarget {
  if (project) {
    return {
      projectName: project.name,
      project,
      rawDir: projectRawPath(project),
      processedDir: projectProcessedPath(project),
      metaInstructionPath: projectMetaInstructionPath(project),
    };
  }
  return {
    projectName: 'default',
    rawDir: `default/${PROJECT_RAW_DIR}`,
    processedDir: defaultProcessedPath(),
    metaInstructionPath: defaultMetaInstructionPath(),
  };
}

async function currentRootPath(): Promise<string> {
  return resolveMarkdownRoot(useStore.getState().settings.markdownStorageDir);
}

async function processedFiles(
  rootPath: string,
  processedDir: string,
): Promise<ProcessedFiles> {
  const absProcessed = await joinKnowledgePath(rootPath, processedDir);
  const absVector = await joinKnowledgePath(absProcessed, 'vector-index');
  await ensureKnowledgeDir(absProcessed);
  await ensureKnowledgeDir(absVector);
  return {
    documents: await joinKnowledgePath(absProcessed, 'documents.json'),
    pages: await joinKnowledgePath(absProcessed, 'pages.jsonl'),
    sentences: await joinKnowledgePath(absProcessed, 'sentences.jsonl'),
    chunks: await joinKnowledgePath(absProcessed, 'chunks.jsonl'),
    summaries: await joinKnowledgePath(absProcessed, 'summaries.jsonl'),
    index: await joinKnowledgePath(absProcessed, 'index.json'),
    vectorManifest: await joinKnowledgePath(absVector, 'manifest.json'),
  };
}

async function scanRawFiles(
  rootPath: string,
  rawDir: string,
): Promise<RawKnowledgeFile[]> {
  const absRaw = await joinKnowledgePath(rootPath, rawDir);
  await ensureKnowledgeDir(absRaw);
  const files: RawKnowledgeFile[] = [];
  await walkRawDir(absRaw, rawDir, files);
  files.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  return files;
}

async function walkRawDir(
  absDir: string,
  relDir: string,
  out: RawKnowledgeFile[],
): Promise<void> {
  const entries = await readKnowledgeDir(absDir);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absPath = await joinKnowledgePath(absDir, entry.name);
    const relPath = `${relDir}/${entry.name}`;
    if (entry.isDirectory) {
      await walkRawDir(absPath, relPath, out);
      continue;
    }
    if (!entry.isFile) continue;
    const extension = extensionOf(entry.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) continue;
    const bytes = await readKnowledgeBytes(absPath);
    out.push({
      sourcePath: relPath,
      absPath,
      title: entry.name,
      extension,
      bytes,
      hash: await sha256Hex(bytes),
    });
  }
}

async function extractRawDocument(
  file: RawKnowledgeFile,
  meta: { projectName: string; documentId: string; extractedAt: string },
) {
  if (file.extension === 'pdf') {
    const pages = await extractPdfPages(file.bytes);
    if (pages.every((page) => !page.text.trim())) {
      throw new Error('PDF has no extractable text.');
    }
    return {
      projectName: meta.projectName,
      documentId: meta.documentId,
      sourcePath: file.sourcePath,
      title: file.title,
      extension: file.extension,
      hash: file.hash,
      bytes: file.bytes.byteLength,
      extractedAt: meta.extractedAt,
      pages,
    };
  }

  if (file.extension === 'docx') {
    const preview = await extractOfficeTextPreview(file.bytes, 'docx');
    if (!preview.ok) throw new Error(preview.reason);
    if (preview.kind !== 'docx') throw new Error('DOCX extractor returned no text.');
    return {
      projectName: meta.projectName,
      documentId: meta.documentId,
      sourcePath: file.sourcePath,
      title: file.title,
      extension: file.extension,
      hash: file.hash,
      bytes: file.bytes.byteLength,
      extractedAt: meta.extractedAt,
      pages: [{ text: preview.paragraphs.join('\n\n') }],
    };
  }

  const text = new TextDecoder('utf-8').decode(file.bytes);
  return {
    projectName: meta.projectName,
    documentId: meta.documentId,
    sourcePath: file.sourcePath,
    title: file.title,
    extension: file.extension,
    hash: file.hash,
    bytes: file.bytes.byteLength,
    extractedAt: meta.extractedAt,
    pages: [{ text }],
  };
}

async function extractPdfPages(
  bytes: Uint8Array,
): Promise<Array<{ pageNumber: number; text: string }>> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: Array<{ pageNumber: number; text: string }> = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{ str?: string }>;
    pages.push({
      pageNumber,
      text: items
        .map((item) => item.str ?? '')
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
  return pages;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    if (!(await knowledgePathExists(path))) return fallback;
    return JSON.parse(await readKnowledgeText(path)) as T;
  } catch {
    return fallback;
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  try {
    if (!(await knowledgePathExists(path))) return [];
    return (await readKnowledgeText(path))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

function toJsonl(rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

function makeSummaries(documents: KnowledgeDocumentRecord[]) {
  return documents.map((document) => ({
    documentId: document.documentId,
    title: document.title,
    sourcePath: document.sourcePath,
    status: document.status,
    summary:
      document.status === 'ok'
        ? `${document.title}: ${document.sentenceCount} sentences, ${document.chunkCount} chunks.`
        : document.error ?? 'Extraction failed.',
  }));
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
