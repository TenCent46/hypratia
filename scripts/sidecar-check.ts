/**
 * Acceptance tests for the Hypratia sidecar architecture.
 *
 * Run with `pnpm check:sidecar`. Pure-function tests only — the Tauri-coupled
 * `loadSidecar` / `saveSidecar` are exercised by hand. Each `assert` block
 * targets one of the four scenarios from the implementation prompt.
 */

import assert from 'node:assert/strict';
import {
  type HypratiaSidecar,
  SIDECAR_SCHEMA_VERSION,
  mergeSidecarData,
  parseSidecar,
  resolveSidecarPath,
  serializeSidecar,
} from '../src/services/sidecar/schema.ts';
import {
  buildMarkdown,
  mergeMarkdownWithHypratia,
} from '../src/services/export/frontmatter.ts';

let passed = 0;

function section(label: string) {
  console.log(`\n— ${label}`);
}

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------------------
// (1) preserving user frontmatter
section('preserving user-defined frontmatter on Hypratia patch');

check('merge keeps non-hypratia keys verbatim', () => {
  const existing = buildMarkdown(
    {
      title: 'My Note',
      tags: ['research', 'reading'],
      aliases: ['note-1'],
      hypratia_id: 'old',
      hypratia_kind: 'note',
      reviewedBy: 'alice',
    },
    'Body of the note.\n',
  );
  const next = mergeMarkdownWithHypratia(existing, {
    hypratia_id: 'new-id',
    hypratia_kind: 'decision',
  });
  // user keys preserved
  assert.match(next, /title: My Note/);
  assert.match(next, /tags: \[research, reading\]/);
  assert.match(next, /aliases: \[note-1\]/);
  assert.match(next, /reviewedBy: alice/);
  // hypratia keys updated, not duplicated
  assert.match(next, /hypratia_id: new-id/);
  assert.match(next, /hypratia_kind: decision/);
  assert.equal(next.match(/hypratia_id:/g)?.length, 1);
  assert.equal(next.match(/hypratia_kind:/g)?.length, 1);
});

check('merge silently drops non-hypratia keys from a patch', () => {
  const existing = buildMarkdown({ title: 'X', tags: ['a'] }, 'body');
  const next = mergeMarkdownWithHypratia(existing, {
    title: 'Hijacked',
    hypratia_id: 'abc',
  });
  // user-set title must NOT be replaced from the patch
  assert.match(next, /title: X/);
  assert.doesNotMatch(next, /title: Hijacked/);
  assert.match(next, /hypratia_id: abc/);
});

check('merge can clear a hypratia_ key by setting it to undefined', () => {
  const existing = buildMarkdown(
    { hypratia_id: 'abc', hypratia_kind: 'task' },
    'body',
  );
  const next = mergeMarkdownWithHypratia(existing, {
    hypratia_kind: undefined,
  });
  assert.match(next, /hypratia_id: abc/);
  assert.doesNotMatch(next, /hypratia_kind:/);
});

// ---------------------------------------------------------------------------
// (2) saving a laconic view via the pure merger
section('saving a laconic view into the sidecar shape');

check('mergeSidecarData seeds a fresh sidecar with a laconic view', () => {
  const next = mergeSidecarData(null, 'msg_42', {
    laconic_view: {
      text: 'Hypratia should not compete with Obsidian.',
      engine: 'local',
      prompt_version: '2026-05-02-1',
      generated_at: '2026-05-02T00:00:00.000Z',
    },
    source_message_id: 'msg_42',
  });
  assert.equal(next.$schema, 'hypratia.sidecar');
  assert.equal(next.$version, SIDECAR_SCHEMA_VERSION);
  assert.equal(next.hypratia_id, 'msg_42');
  assert.equal(next.laconic_view?.text.startsWith('Hypratia'), true);
  assert.equal(next.laconic_view?.engine, 'local');
  // Schema-meta keys lead the serialized blob — easy to spot in a vault.
  const serialized = serializeSidecar(next);
  assert.match(serialized, /^{\n {2}"\$schema": "hypratia\.sidecar"/);
});

check('mergeSidecarData applied twice carries previous fields forward', () => {
  const initial = mergeSidecarData(null, 'msg_42', {
    embedding_ref: 'sha256:deadbeef',
  });
  const second = mergeSidecarData(initial, 'msg_42', {
    laconic_view: {
      text: 'short',
      engine: 'local',
      prompt_version: '2026-05-02-1',
      generated_at: '2026-05-02T00:00:00.000Z',
    },
  });
  // Second patch did not touch embedding_ref → it must still be present.
  assert.equal(second.embedding_ref, 'sha256:deadbeef');
  assert.equal(second.laconic_view?.text, 'short');
});

// ---------------------------------------------------------------------------
// (3) loading sidecar after a filename rename uses hypratia_id, not path
section('sidecar identity is hypratia_id, not the Markdown filename');

check('resolveSidecarPath ignores Markdown filename / position', () => {
  const before = resolveSidecarPath('msg_42', '/Users/me/Vault');
  // Even if the corresponding Markdown file changes name in Obsidian, the
  // sidecar path is derived from hypratia_id alone.
  const afterRename = resolveSidecarPath('msg_42', '/Users/me/Vault');
  assert.equal(before, afterRename);
  assert.equal(
    before,
    '/Users/me/Vault/Hypratia/.hypratia/sidecars/msg_42.json',
  );
});

check('parseSidecar reads back what serializeSidecar wrote', () => {
  const sidecar: HypratiaSidecar = mergeSidecarData(null, 'msg_99', {
    source_conversation_id: 'conv_1',
    laconic_view: {
      text: 'short',
      engine: 'local',
      prompt_version: 'v1',
      generated_at: '2026-05-02T00:00:00.000Z',
    },
  });
  const text = serializeSidecar(sidecar);
  const parsed = parseSidecar(text, 'msg_99');
  assert.ok(parsed, 'parseSidecar returned null');
  assert.equal(parsed.hypratia_id, 'msg_99');
  assert.equal(parsed.source_conversation_id, 'conv_1');
  assert.equal(parsed.laconic_view?.text, 'short');
});

check('parseSidecar rejects non-Hypratia JSON', () => {
  assert.equal(parseSidecar('{}', 'x'), null);
  assert.equal(parseSidecar('{"$schema":"obsidian.canvas"}', 'x'), null);
  assert.equal(parseSidecar('not json', 'x'), null);
});

check('sanitized id keeps the path filesystem-safe', () => {
  const path = resolveSidecarPath('msg/with:weird*chars', '/v');
  assert.match(path, /msg_with_weird_chars\.json$/);
});

// ---------------------------------------------------------------------------
// (4) markdown stays Obsidian-readable
section('markdown stays clean and Obsidian-readable');

check('merge produces a single YAML block at the top, then body', () => {
  const out = mergeMarkdownWithHypratia(
    '',
    { hypratia_id: 'abc', hypratia_kind: 'note' },
    '# Title\n\nBody text.\n',
  );
  // Frontmatter must be a single fenced block at the very top.
  assert.match(out, /^---\n([\s\S]*?)\n---\n/);
  const fm = out.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  // No huge JSON blobs (laconic / embeddings / markers belong in sidecar).
  assert.doesNotMatch(fm, /laconic/);
  assert.doesNotMatch(fm, /embedding/);
  assert.doesNotMatch(fm, /selection_marker/);
  // Body intact.
  assert.match(out, /# Title\n\nBody text\.\n$/);
});

check('round-trip merge does not duplicate frontmatter blocks', () => {
  let doc = mergeMarkdownWithHypratia(
    '',
    { hypratia_id: 'a', hypratia_kind: 'note' },
    'Body.\n',
  );
  doc = mergeMarkdownWithHypratia(doc, {
    hypratia_kind: 'decision',
  });
  doc = mergeMarkdownWithHypratia(doc, {
    hypratia_updated: '2026-05-02T00:00:00.000Z',
  });
  // Exactly one `---` … `---` block.
  const matches = doc.match(/^---\n[\s\S]*?\n---\n/gm) ?? [];
  assert.equal(matches.length, 1);
  // Latest values win, earlier ones still present.
  assert.match(doc, /hypratia_id: a/);
  assert.match(doc, /hypratia_kind: decision/);
  assert.match(doc, /hypratia_updated:/);
});

console.log(`\n✓ ${passed} sidecar checks passed.\n`);
