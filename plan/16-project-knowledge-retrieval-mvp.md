# 16 — Project knowledge retrieval MVP

**Goal:** keep project chat context small while making `raw/` documents searchable, citable, and readable by exact source range.

## Completed in the current MVP

- Knowledge Base file view now lists all files with extensions, including hidden files, instead of only `.md`.
- Non-Markdown files in the file view open in an in-app preview tab.
- Preview support covers PDF, image, CSV, text-like files, DOCX, and PPTX text extraction.
- Unsupported binary files still open as a preview shell with `Open externally` and `Reveal`.
- `raw/` indexing scans project/default raw folders and computes SHA-256 hashes.
- Unchanged files are reused from existing `processed/` records.
- Deleted raw files are removed from regenerated processed/index output.
- Extracted records are written under `processed/`:
  - `documents.json`
  - `pages.jsonl`
  - `sentences.jsonl`
  - `chunks.jsonl`
  - `summaries.jsonl`
  - `index.json`
  - `vector-index/manifest.json`
- PDF extraction preserves page numbers.
- DOCX extraction uses the existing Office XML text extractor.
- Markdown/text/CSV/JSON are converted to canonical text records.
- Chunk records preserve document id, source path, title, heading path, page range, sentence range, text, contextual text, and token estimate.
- Local BM25-compatible lexical search is implemented over contextual chunk text.
- Exact page/sentence range reads are implemented from canonical processed records.
- Chat tools are registered:
  - `knowledge_search`
  - `knowledge_read_document_range`
- Chat always-loaded context is limited to `instruction.md`, `memory.md`, `meta-instruction.md`, and project system prompt.
- Default `meta-instruction.md` is created if missing.
- The Files tab triggers indexing after file add and when opened.
- Verification script added: `npm run check:knowledge`.

## Remaining tasks

- Replace the JSON lexical index with SQLite FTS5 or a proper BM25-backed local index.
- Add vector search and rank fusion.
- Add optional reranking for top results.
- Add a real embedding provider path or local vector store instead of the current `vector-index/manifest.json` placeholder.
- Add OCR as an optional fallback for scanned PDFs with no extractable text.
- Add richer DOCX heading extraction rather than paragraph-only extraction.
- Add XLSX extraction if spreadsheet knowledge should be searchable.
- Add source-highlight navigation from citations back into the PDF/page viewer.
- Add UI status for indexing failures per file, not just console/log status.
- Add a manual “Rebuild index” command per project.
- Add tests that run through the Tauri filesystem layer with real fixture files.
- Add regression coverage for deleting and renaming raw files.
- Add token-budget trimming tests for large corpora.
- Improve non-Markdown preview reuse to avoid duplicated CSV/Office rendering code.

## Verification commands

- `npm run check:knowledge`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `cargo check` from `src-tauri/`

## Current limitations

- Search is lexical-only in the MVP.
- PDF extraction depends on embedded text; scanned PDFs will index as extraction errors.
- Binary files without an inline renderer are accessible through external open/reveal only.
- Chat tool use depends on the model choosing the registered knowledge tools correctly.
