import assert from 'node:assert/strict';
import {
  buildCanonicalKnowledgeRecords,
  buildLexicalIndex,
  readKnowledgeRange,
  searchKnowledgeChunks,
} from '../src/services/knowledge/projectRetrievalCore.ts';

const extracted = {
  projectName: 'Fixture Project',
  documentId: 'doc_fixture_pdf',
  sourcePath: 'projects/fixture/raw/fixture.pdf',
  title: 'fixture.pdf',
  extension: 'pdf',
  hash: 'fixture-hash',
  bytes: 1234,
  extractedAt: '2026-05-02T00:00:00.000Z',
  pages: [
    {
      pageNumber: 1,
      text: 'The project goal is to compare canonical text retrieval with prompt stuffing.',
    },
    {
      pageNumber: 2,
      text: 'Hydrogen revenue assumptions are documented here. The exact source sentence should be readable by range.',
    },
  ],
};

const records = buildCanonicalKnowledgeRecords(extracted);
assert.equal(records.document.status, 'ok');
assert.equal(records.pages.length, 2);
assert.ok(records.sentences.length >= 2);
assert.ok(records.chunks.length >= 1);

const index = buildLexicalIndex(records.chunks);
assert.equal(index.kind, 'bm25-json');
assert.ok(index.chunkCount >= 1);
assert.ok(index.documentFrequencies.hydrogen >= 1);

const results = searchKnowledgeChunks({
  query: 'hydrogen revenue assumptions',
  chunks: records.chunks,
  topK: 3,
});
assert.ok(results.length >= 1);
assert.equal(results[0].documentId, extracted.documentId);
assert.ok(results[0].citation.includes('fixture.pdf'));
assert.ok(results[0].text.toLowerCase().includes('hydrogen revenue'));

const pageText = readKnowledgeRange({
  documentId: extracted.documentId,
  pages: records.pages,
  sentences: records.sentences,
  pageStart: 2,
  pageEnd: 2,
});
assert.ok(pageText.includes('Hydrogen revenue assumptions'));

const sentenceText = readKnowledgeRange({
  documentId: extracted.documentId,
  pages: records.pages,
  sentences: records.sentences,
  sentenceStart: results[0].sentenceStart,
  sentenceEnd: results[0].sentenceEnd,
});
assert.ok(sentenceText.includes('exact source sentence'));

console.log(
  JSON.stringify(
    {
      ok: true,
      pages: records.pages.length,
      sentences: records.sentences.length,
      chunks: records.chunks.length,
      searchResults: results.length,
    },
    null,
    2,
  ),
);
