/**
 * Acceptance tests for the click-flow wikilink resolver.
 *
 * Run with `pnpm check:wikilink-resolver`. Drives the pure
 * `resolveWikilinkClick` directly with hand-built `ctx`, so we exercise
 * the decision tree without any vault filesystem or Zustand store. Each
 * `check` block targets one of the five scenarios from the
 * implementation prompt.
 */

import assert from 'node:assert/strict';
import {
  resolveWikilinkClick,
  type FileEntry,
  type NodeRef,
  type WikilinkResolverContext,
} from '../src/services/markdown/wikilinkResolver.ts';
import type { FrontmatterIdentity } from '../src/services/markdown/wikilinks.ts';

let passed = 0;

function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Convenience: build a ctx from a static "vault snapshot" and "store nodes". */
function ctx(opts: {
  files: FileEntry[];
  nodes?: NodeRef[];
  frontmatter?: Record<string, FrontmatterIdentity>;
}): WikilinkResolverContext {
  const nodes = new Map<string, NodeRef>();
  for (const n of opts.nodes ?? []) nodes.set(n.id, n);
  return {
    files: opts.files,
    nodes,
    readFrontmatter: async (path) => opts.frontmatter?.[path] ?? null,
  };
}

// ---------------------------------------------------------------------------
// (1) clicking [[Title]] opens the correct node
section('clicking [[Title]] opens the correct Hypratia node');

await check(
  'unique title with hypratia_id pointing at a known node → open-node',
  async () => {
    const result = await resolveWikilinkClick(
      'Designing Hypratia',
      ctx({
        files: [
          { path: 'Hypratia/Notes/designing.md', stem: 'Designing Hypratia', name: 'Designing Hypratia.md' },
        ],
        nodes: [
          { id: 'node_42', conversationId: 'conv_1', title: 'Designing Hypratia' },
        ],
        frontmatter: {
          'Hypratia/Notes/designing.md': {
            hypratiaId: 'node_42',
            title: 'Designing Hypratia',
            aliases: ['Designing Hypratia'],
          },
        },
      }),
    );
    assert.equal(result.status, 'open-node');
    if (result.status !== 'open-node') return;
    assert.equal(result.nodeId, 'node_42');
    assert.equal(result.conversationId, 'conv_1');
    assert.equal(result.path, 'Hypratia/Notes/designing.md');
  },
);

await check(
  'pathful target [[Folder/Note]] resolves directly to that path',
  async () => {
    const result = await resolveWikilinkClick(
      'Hypratia/Notes/designing',
      ctx({
        files: [
          { path: 'Hypratia/Notes/designing.md', stem: 'Designing Hypratia', name: 'Designing Hypratia.md' },
        ],
        nodes: [{ id: 'node_42', conversationId: 'conv_1', title: 'Designing Hypratia' }],
        frontmatter: {
          'Hypratia/Notes/designing.md': { hypratiaId: 'node_42', title: 'Designing Hypratia' },
        },
      }),
    );
    assert.equal(result.status, 'open-node');
  },
);

// ---------------------------------------------------------------------------
// (2) clicking [[Title]] still works after Markdown filename rename
section('survives an Obsidian filename rename via frontmatter aliases');

await check(
  'file renamed but frontmatter title + alias preserved → still resolves',
  async () => {
    const result = await resolveWikilinkClick(
      'Designing Hypratia',
      ctx({
        // Filename changed to `Renamed.md` after the user renamed in Obsidian.
        files: [{ path: 'Hypratia/Notes/Renamed.md', stem: 'Renamed', name: 'Renamed.md' }],
        nodes: [{ id: 'node_42', conversationId: 'conv_1', title: 'Designing Hypratia' }],
        frontmatter: {
          'Hypratia/Notes/Renamed.md': {
            hypratiaId: 'node_42',
            title: 'Designing Hypratia',
            aliases: ['Designing Hypratia'],
          },
        },
      }),
    );
    assert.equal(result.status, 'open-node');
    if (result.status !== 'open-node') return;
    assert.equal(result.nodeId, 'node_42');
    assert.equal(result.path, 'Hypratia/Notes/Renamed.md');
  },
);

// ---------------------------------------------------------------------------
// (3) duplicate titles → pathful disambiguation
section('duplicate titles disambiguate cleanly');

await check(
  'pathful link [[A/Notes|Notes]] picks the right file even when title collides',
  async () => {
    const result = await resolveWikilinkClick(
      'Hypratia/Notes/a',
      ctx({
        files: [
          { path: 'Hypratia/Notes/a.md', stem: 'a', name: 'a.md' },
          { path: 'Hypratia/Notes/b.md', stem: 'b', name: 'b.md' },
        ],
        nodes: [
          { id: 'node_a', conversationId: 'conv_1', title: 'Notes' },
          { id: 'node_b', conversationId: 'conv_1', title: 'Notes' },
        ],
        frontmatter: {
          'Hypratia/Notes/a.md': { hypratiaId: 'node_a', title: 'Notes' },
          'Hypratia/Notes/b.md': { hypratiaId: 'node_b', title: 'Notes' },
        },
      }),
    );
    assert.equal(result.status, 'open-node');
    if (result.status !== 'open-node') return;
    assert.equal(result.nodeId, 'node_a');
  },
);

await check(
  'bare title with two files of equal score → ambiguous, surface chooser',
  async () => {
    const result = await resolveWikilinkClick(
      'Notes',
      ctx({
        files: [
          { path: 'Hypratia/Notes/a.md', stem: 'a', name: 'a.md' },
          { path: 'Hypratia/Notes/b.md', stem: 'b', name: 'b.md' },
        ],
        nodes: [
          { id: 'node_a', conversationId: 'conv_1', title: 'Notes' },
          { id: 'node_b', conversationId: 'conv_1', title: 'Notes' },
        ],
        frontmatter: {
          'Hypratia/Notes/a.md': { hypratiaId: 'node_a', title: 'Notes' },
          'Hypratia/Notes/b.md': { hypratiaId: 'node_b', title: 'Notes' },
        },
      }),
    );
    assert.equal(result.status, 'ambiguous');
    if (result.status !== 'ambiguous') return;
    assert.equal(result.candidates.length, 2);
    // Both candidates expose the matching node-id so the chooser can route
    // either to a node-open or a markdown-open click handler.
    assert.ok(result.candidates.every((c) => Boolean(c.nodeId)));
  },
);

await check(
  'one of two candidates wins on alias rank → no chooser, just open it',
  async () => {
    const result = await resolveWikilinkClick(
      'Q1 Plan',
      ctx({
        files: [
          { path: 'Hypratia/Notes/q1-plan.md', stem: 'q1-plan', name: 'q1-plan.md' },
          { path: 'Hypratia/Notes/old.md', stem: 'old', name: 'old.md' },
        ],
        nodes: [{ id: 'node_q1', conversationId: 'conv_1', title: 'Q1 Plan' }],
        frontmatter: {
          // Exact title match — score 100
          'Hypratia/Notes/q1-plan.md': { hypratiaId: 'node_q1', title: 'Q1 Plan', aliases: ['Q1 Plan'] },
          // Alias-only — lower score
          'Hypratia/Notes/old.md': { aliases: ['Q1 Plan'], title: 'Old Plan' },
        },
      }),
    );
    assert.equal(result.status, 'open-node');
    if (result.status !== 'open-node') return;
    assert.equal(result.nodeId, 'node_q1');
  },
);

// ---------------------------------------------------------------------------
// (4) missing target → unresolved state
section('missing target returns unresolved');

await check('wikilink with no matching file → unresolved', async () => {
  const result = await resolveWikilinkClick(
    'Nothing Here',
    ctx({
      files: [{ path: 'Hypratia/Notes/other.md', stem: 'other', name: 'other.md' }],
      frontmatter: {
        'Hypratia/Notes/other.md': { title: 'Other' },
      },
    }),
  );
  assert.equal(result.status, 'unresolved');
  if (result.status !== 'unresolved') return;
  assert.equal(result.query, 'Nothing Here');
});

await check(
  'pathful target pointing at a non-existent file → unresolved',
  async () => {
    const result = await resolveWikilinkClick(
      'Hypratia/Notes/missing',
      ctx({
        files: [
          { path: 'Hypratia/Notes/other.md', stem: 'other', name: 'other.md' },
        ],
      }),
    );
    assert.equal(result.status, 'unresolved');
  },
);

await check(
  'file matches but no hypratia_id and no node → open-markdown (import needed)',
  async () => {
    const result = await resolveWikilinkClick(
      'Plain Note',
      ctx({
        files: [{ path: 'Hypratia/Notes/plain.md', stem: 'Plain Note', name: 'Plain Note.md' }],
        nodes: [],
        frontmatter: {
          'Hypratia/Notes/plain.md': { title: 'Plain Note' },
        },
      }),
    );
    assert.equal(result.status, 'open-markdown');
    if (result.status !== 'open-markdown') return;
    assert.equal(result.reason, 'no-frontmatter-id');
  },
);

await check(
  'file has hypratia_id but the node is gone → open-markdown with reason',
  async () => {
    const result = await resolveWikilinkClick(
      'Orphan Note',
      ctx({
        files: [{ path: 'Hypratia/Notes/orphan.md', stem: 'Orphan Note', name: 'Orphan Note.md' }],
        nodes: [],
        frontmatter: {
          'Hypratia/Notes/orphan.md': { hypratiaId: 'gone', title: 'Orphan Note' },
        },
      }),
    );
    assert.equal(result.status, 'open-markdown');
    if (result.status !== 'open-markdown') return;
    assert.equal(result.reason, 'no-matching-node');
  },
);

// ---------------------------------------------------------------------------
// (5) legacy LLM-* note with hypratia_id still resolves
section('legacy LLM-* exports keep resolving via legacy `id` frontmatter');

await check(
  'legacy file with `id:` (no `hypratia_id`) → falls back through legacyId',
  async () => {
    const result = await resolveWikilinkClick(
      'Legacy Note',
      ctx({
        files: [
          { path: 'LLM-Nodes/node-legacy-foo.md', stem: 'node-legacy-foo', name: 'node-legacy-foo.md' },
        ],
        nodes: [{ id: 'legacy_id_1', conversationId: 'conv_legacy', title: 'Legacy Note' }],
        frontmatter: {
          'LLM-Nodes/node-legacy-foo.md': {
            legacyId: 'legacy_id_1',
            title: 'Legacy Note',
            aliases: ['Legacy Note'],
          },
        },
      }),
    );
    assert.equal(result.status, 'open-node');
    if (result.status !== 'open-node') return;
    assert.equal(result.nodeId, 'legacy_id_1');
    assert.equal(result.hypratiaId, 'legacy_id_1');
    assert.equal(result.path, 'LLM-Nodes/node-legacy-foo.md');
  },
);

await check(
  'legacy file with id but node id missing in store → open-markdown (no-matching-node)',
  async () => {
    const result = await resolveWikilinkClick(
      'Legacy Without Node',
      ctx({
        files: [
          { path: 'LLM-Nodes/node-old-x.md', stem: 'node-old-x', name: 'node-old-x.md' },
        ],
        nodes: [],
        frontmatter: {
          'LLM-Nodes/node-old-x.md': {
            legacyId: 'gone-legacy',
            title: 'Legacy Without Node',
          },
        },
      }),
    );
    assert.equal(result.status, 'open-markdown');
    if (result.status !== 'open-markdown') return;
    assert.equal(result.reason, 'no-matching-node');
  },
);

console.log(`\n✓ ${passed} wikilink-resolver checks passed.\n`);
