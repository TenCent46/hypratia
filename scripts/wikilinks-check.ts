/**
 * Acceptance tests for the natural-wikilink rewrite (plan v1.2).
 *
 * Run with `pnpm check:wikilinks`. Pure-function tests — the fs-coupled
 * `indexVaultTitles` / `resolveByHypratiaId` are exercised by hand inside
 * the running app. Each `check` block targets one of the five scenarios
 * spelled out in the implementation prompt.
 */

import assert from 'node:assert/strict';
import {
  appendWikiLink,
  buildNaturalWikilink,
  buildTitleCounts,
  mergeAliases,
  pathForWikilink,
  readFrontmatterIdentity,
  sanitizeTitleForWikilink,
  wikiTitle,
} from '../src/services/markdown/wikilinks.ts';
import { buildMarkdown } from '../src/services/export/frontmatter.ts';

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
// (1) simple [[Title]] generation
section('simple [[Title]] generation');

check('buildNaturalWikilink emits [[Title]] when titles are unique', () => {
  const counts = buildTitleCounts([
    { title: 'Designing Hypratia', mdPath: 'Hypratia/Notes/a.md' },
    { title: 'Local-first', mdPath: 'Hypratia/Notes/b.md' },
  ]);
  const link = buildNaturalWikilink(
    {
      title: 'Designing Hypratia',
      path: 'Hypratia/Notes/a.md',
      hypratiaId: 'node_a',
    },
    counts,
  );
  assert.equal(link, '[[Designing Hypratia]]');
});

check('buildNaturalWikilink with no counts also emits the natural form', () => {
  const link = buildNaturalWikilink({ title: 'My Title' });
  assert.equal(link, '[[My Title]]');
});

check('appendWikiLink inserts the natural link inside Canvas Links section', () => {
  const before = '# A note\n\nBody.\n';
  const after = appendWikiLink(before, {
    title: 'Local-first',
    path: 'Hypratia/Notes/b.md',
  });
  assert.match(after, /## Canvas Links/);
  assert.match(after, /- \[\[Local-first\]\]/);
});

// ---------------------------------------------------------------------------
// (2) duplicate titles fall back to [[path|Title]]
section('duplicate titles disambiguate to [[path|Title]]');

check('collision emits the path-form alias link', () => {
  const counts = buildTitleCounts([
    { title: 'Notes', mdPath: 'Hypratia/Notes/a.md' },
    { title: 'Notes', mdPath: 'Hypratia/Notes/b.md' },
  ]);
  const link = buildNaturalWikilink(
    { title: 'Notes', path: 'Hypratia/Notes/a.md' },
    counts,
  );
  assert.equal(link, '[[Hypratia/Notes/a|Notes]]');
});

check('collision without a path falls back to [[Title]] (best-effort)', () => {
  const counts = new Map([['Notes', 2]]);
  const link = buildNaturalWikilink({ title: 'Notes' }, counts);
  assert.equal(link, '[[Notes]]');
});

check('pathForWikilink strips .md/.markdown extensions', () => {
  assert.equal(pathForWikilink('Hypratia/Notes/a.md'), 'Hypratia/Notes/a');
  assert.equal(
    pathForWikilink('Hypratia/Notes/long.markdown'),
    'Hypratia/Notes/long',
  );
});

check('aliases with `|` are escaped, so the link parser stays sane', () => {
  const counts = new Map([['Pipes|Inside', 2]]);
  const link = buildNaturalWikilink(
    { title: 'Pipes|Inside', path: 'a.md' },
    counts,
  );
  // path-form: alias slot must escape the bare pipe
  assert.equal(link, '[[a|Pipes\\|Inside]]');
});

// ---------------------------------------------------------------------------
// (3) resolving hypratia_id from linked Markdown
section('hypratia_id resolution from a target Markdown');

check('readFrontmatterIdentity reads hypratia_id, title, aliases', () => {
  const md = buildMarkdown(
    {
      hypratia_id: 'node_42',
      hypratia_kind: 'note',
      title: 'My Note',
      aliases: ['Alt One', 'Alt Two'],
      tags: ['research'],
    },
    'Body.\n',
  );
  const id = readFrontmatterIdentity(md);
  assert.equal(id.hypratiaId, 'node_42');
  assert.equal(id.title, 'My Note');
  assert.deepEqual(id.aliases, ['Alt One', 'Alt Two']);
});

check('readFrontmatterIdentity falls back to legacy `id` for old exports', () => {
  const md = buildMarkdown(
    { id: 'node_legacy', title: 'Legacy Note' },
    'Body.\n',
  );
  const id = readFrontmatterIdentity(md);
  assert.equal(id.hypratiaId, undefined);
  assert.equal(id.legacyId, 'node_legacy');
});

check('readFrontmatterIdentity tolerates malformed frontmatter', () => {
  // No frontmatter at all
  assert.deepEqual(readFrontmatterIdentity('just body text'), {});
  // Empty document
  assert.deepEqual(readFrontmatterIdentity(''), {});
});

check('a single alias string is normalized to an array', () => {
  const md = buildMarkdown(
    { hypratia_id: 'x', aliases: 'Only One' },
    '',
  );
  const id = readFrontmatterIdentity(md);
  assert.deepEqual(id.aliases, ['Only One']);
});

// ---------------------------------------------------------------------------
// (4) preserving existing aliases / tags
section('preserving user-defined aliases and tags');

check('mergeAliases adds the title without dropping user-set aliases', () => {
  const out = mergeAliases(['Old Alt', 'Another'], 'My Title');
  assert.deepEqual(out, ['Old Alt', 'Another', 'My Title']);
});

check('mergeAliases is idempotent — title already present stays once', () => {
  const out = mergeAliases(['My Title', 'extra'], 'My Title');
  assert.deepEqual(out, ['My Title', 'extra']);
});

check('mergeAliases on undefined existing produces a single-entry array', () => {
  const out = mergeAliases(undefined, 'Title');
  assert.deepEqual(out, ['Title']);
});

check('mergeAliases sanitizes wikilink-hostile chars in the title', () => {
  const out = mergeAliases(['plain'], 'Has [brackets] in it');
  assert.deepEqual(out, ['plain', 'Has  brackets  in it']);
});

// ---------------------------------------------------------------------------
// (5) absolutely no [[node-id|Title]] links emitted
section('no node-id leaks in user-visible links');

check('buildNaturalWikilink output never contains "node-"', () => {
  const samples = [
    buildNaturalWikilink({ title: 'A', path: 'x.md' }),
    buildNaturalWikilink({ title: 'A', path: 'x.md' }, new Map([['A', 2]])),
    buildNaturalWikilink({ title: 'A' }),
    buildNaturalWikilink({ title: 'Has|Pipe', path: 'p.md' }, new Map([['Has|Pipe', 2]])),
  ];
  for (const link of samples) {
    assert.doesNotMatch(link, /\[\[node-/);
  }
});

check('appendWikiLink output never contains "[[node-"', () => {
  const out = appendWikiLink('# Note\n', { title: 'X', path: 'a.md' });
  assert.doesNotMatch(out, /\[\[node-/);
});

check('wikiTitle scrubs `[`/`]` from raw titles before they reach a link', () => {
  const t = wikiTitle({ title: '[Bracketed] Title' });
  assert.doesNotMatch(t, /[[\]]/);
  assert.equal(sanitizeTitleForWikilink('[a]b'), 'a b');
});

console.log(`\n✓ ${passed} wikilink checks passed.\n`);
