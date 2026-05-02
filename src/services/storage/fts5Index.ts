import { invoke } from '@tauri-apps/api/core';
import type { KnowledgeChunkRecord } from '../knowledge/projectRetrievalCore';

/**
 * Thin TypeScript wrapper around the Rust `fts_index_*` commands.
 *
 * The Rust side owns one SQLite (with FTS5) database per project, located
 * at `<vault>/<scope>/processed/index.sqlite`. Schema, transactions and
 * BM25 ranking all live there; this file only marshals data and result
 * shapes. See `src-tauri/src/lib.rs` for the actual SQL.
 */

const FTS_DB_FILENAME = 'index.sqlite';

/** Compute the path to a project's FTS5 DB (relative to the markdown root). */
export function ftsDbRelPath(processedDir: string): string {
  return `${processedDir}/${FTS_DB_FILENAME}`;
}

type FtsChunkInput = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  sentenceStart: number | null;
  sentenceEnd: number | null;
  contextualText: string | null;
  text: string;
  tokenCount: number | null;
};

export type FtsSearchResult = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  sentenceStart: number | null;
  sentenceEnd: number | null;
  contextualText: string | null;
  text: string;
  tokenCount: number | null;
  bm25: number;
  /** Higher = more relevant. Pre-flipped from FTS5's lower-is-better bm25. */
  score: number;
};

/** Delimiter used when serialising `string[]` headingPath into a single
 *  SQLite cell. We pick something a heading would never contain. */
export const HEADING_PATH_DELIM = ' › '; // " › "

export function encodeHeadingPath(parts: string[] | undefined | null): string | null {
  if (!parts || parts.length === 0) return null;
  return parts.join(HEADING_PATH_DELIM);
}

export function decodeHeadingPath(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(HEADING_PATH_DELIM).filter(Boolean);
}

function chunkToFtsInput(c: KnowledgeChunkRecord): FtsChunkInput {
  return {
    chunkId: c.chunkId,
    documentId: c.documentId,
    sourcePath: c.sourcePath,
    title: c.title,
    headingPath: encodeHeadingPath(c.headingPath),
    pageStart: c.pageStart ?? null,
    pageEnd: c.pageEnd ?? null,
    sentenceStart: c.sentenceStart,
    sentenceEnd: c.sentenceEnd,
    contextualText: c.contextualText ?? null,
    text: c.text,
    tokenCount: c.tokenCount,
  };
}

/**
 * Replace every row of the project's FTS5 chunks table with `chunks`.
 * Used by the rebuild pipeline after canonical extraction completes.
 * Returns the number of rows inserted.
 */
export async function ftsIndexReplace(
  rootPath: string,
  processedDir: string,
  chunks: KnowledgeChunkRecord[],
): Promise<number> {
  const inputs = chunks.map(chunkToFtsInput);
  return invoke<number>('fts_index_replace', {
    rootPath,
    dbRelPath: ftsDbRelPath(processedDir),
    chunks: inputs,
  });
}

/**
 * Run a BM25 query against the project's FTS5 index. Returns at most
 * `topK` rows (default 20, max 200), sorted by descending relevance.
 * Empty / whitespace-only queries return an empty array.
 */
export async function ftsIndexSearch(
  rootPath: string,
  processedDir: string,
  query: string,
  topK = 20,
): Promise<FtsSearchResult[]> {
  return invoke<FtsSearchResult[]>('fts_index_search', {
    rootPath,
    dbRelPath: ftsDbRelPath(processedDir),
    query,
    topK,
  });
}

export async function ftsIndexClear(
  rootPath: string,
  processedDir: string,
): Promise<void> {
  await invoke('fts_index_clear', {
    rootPath,
    dbRelPath: ftsDbRelPath(processedDir),
  });
}
