/**
 * Acceptance tests for Obsidian-friendly sidecar frontmatter.
 *
 * Run with `pnpm check:sidecar-frontmatter`. Pure-function tests
 * against:
 *
 *   - `services/export/jsonCanvasFormat.toJsonCanvas`
 *     → verifies the per-node sidecar's `patch` / `publicPatch` /
 *       `body` shape: title, aliases, hypratiaType, H1 heading.
 *   - `services/export/frontmatter.mergeMarkdownWithHypratia`
 *     → verifies the new `publicPatch.set` (overwrite-on-sync) and
 *       `publicPatch.ensureAliases` (merge-with-existing) semantics.
 *
 * Stable-ID filenames are intentional — see SidecarPayload.relPath in
 * jsonCanvasFormat.ts. We test that filenames stay `{id}.md` even
 * when a title would slugify "differently" so a future regression
 * that quietly swaps to title-based filenames trips here.
 */

import assert from 'node:assert/strict';
import {
  NOTES_DIR,
  toJsonCanvas,
  type JsonCanvasNode,
  type SidecarPayload,
} from '../src/services/export/jsonCanvasFormat.ts';
import { mergeMarkdownWithHypratia } from '../src/services/export/frontmatter.ts';
import type { CanvasNode } from '../src/types/index.ts';

let passed = 0;
function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NOW_ISO = '2026-05-03T12:00:00.000Z';
const LONG_BODY = 'x'.repeat(400); // forces sidecar emission

function makeNode(over: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    id: over.id,
    conversationId: over.conversationId ?? 'c1',
    kind: over.kind ?? 'markdown',
    title: over.title ?? `Node ${over.id}`,
    contentMarkdown: over.contentMarkdown ?? LONG_BODY,
    position: over.position ?? { x: 0, y: 0 },
    width: over.width ?? 280,
    height: over.height ?? 160,
    tags: over.tags ?? [],
    createdAt: over.createdAt ?? NOW_ISO,
    updatedAt: over.updatedAt ?? NOW_ISO,
  } as CanvasNode;
}

function findSidecar(
  sidecars: SidecarPayload[],
  id: string,
): SidecarPayload | undefined {
  return sidecars.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
section('stable-ID filename rule (intentional, see SidecarPayload.relPath)');

await check('sidecar relPath is `{id}.md` regardless of title', () => {
  const node = makeNode({
    id: 'node-with-funky-id_42',
    title: 'A Very Different Title That Would Slug-ify Otherwise',
  });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, node.id);
  assert.ok(sidecar);
  assert.equal(sidecar!.relPath, `${NOTES_DIR}/node-with-funky-id_42.md`);
});

await check('canvas file-node `file` reference points at the same path', () => {
  const node = makeNode({ id: 'aaa' });
  const { canvas, sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'aaa');
  const fileNode = canvas.nodes.find(
    (n): n is Extract<JsonCanvasNode, { type: 'file' }> => n.type === 'file',
  );
  assert.ok(fileNode);
  assert.equal(fileNode!.file, sidecar!.relPath);
});

// ---------------------------------------------------------------------------
section('sidecar publicPatch — Obsidian-readable identity keys');

await check('publicPatch.set carries id, title, hypratiaType', () => {
  const node = makeNode({ id: 'n1', title: 'Hypratia の思想' });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1');
  assert.ok(sidecar?.publicPatch);
  assert.equal(sidecar!.publicPatch!.set!.id, 'n1');
  assert.equal(sidecar!.publicPatch!.set!.title, 'Hypratia の思想');
  assert.equal(sidecar!.publicPatch!.set!.hypratiaType, 'note');
});

await check('publicPatch.ensureAliases includes title + node-{id}', () => {
  const node = makeNode({ id: 'n1', title: 'My Note' });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1');
  assert.deepEqual(sidecar!.publicPatch!.ensureAliases, ['My Note', 'node-n1']);
});

await check('publicPatch handles empty title gracefully (no empty alias, no title key)', () => {
  const node = makeNode({ id: 'n1', title: '' });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1');
  assert.equal(sidecar!.publicPatch!.set!.title, undefined);
  // Only the `node-{id}` alias survives when the title is empty.
  assert.deepEqual(sidecar!.publicPatch!.ensureAliases, ['node-n1']);
});

await check('hypratia_id stays in the internal patch (sync-identity contract)', () => {
  const node = makeNode({ id: 'n1', title: 'Anything' });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1');
  assert.equal(sidecar!.patch.hypratia_id, 'n1');
  assert.equal(sidecar!.patch.hypratia_kind, 'markdown');
});

// ---------------------------------------------------------------------------
section('sidecar body always starts with H1 (Front Matter Title fallback)');

await check('body without leading heading gets `# {title}` prefixed', () => {
  const node = makeNode({
    id: 'n1',
    title: 'Hello World',
    contentMarkdown: `${LONG_BODY}\n\nplain prose, no heading`,
  });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1');
  assert.match(sidecar!.body, /^# Hello World\n\n/);
});

await check('body with existing heading is not double-prefixed', () => {
  const node = makeNode({
    id: 'n1',
    title: 'Hello World',
    contentMarkdown: `# Different Heading\n\n${LONG_BODY}`,
  });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1');
  // Body keeps the user's heading verbatim.
  assert.match(sidecar!.body, /^# Different Heading\n/);
  assert.equal(sidecar!.body.match(/^#/gm)?.length, 1);
});

// ---------------------------------------------------------------------------
section('mergeMarkdownWithHypratia — publicPatch.set (overwrite-on-sync)');

await check('writes id / title / hypratiaType into the file', () => {
  const out = mergeMarkdownWithHypratia(
    '',
    { hypratia_id: 'n1' },
    'Body content.',
    {
      set: { id: 'n1', title: 'My Title', hypratiaType: 'note' },
    },
  );
  assert.match(out, /^---\n[\s\S]*\n---\n/, 'frontmatter block is present');
  assert.match(out, /\nid: n1\n/);
  // Plain ASCII titles serialize unquoted (per the conservative-quote
  // rule in formatString); YAML accepts `title: My Title` as a string.
  assert.match(out, /\ntitle: My Title\n/);
  assert.match(out, /\nhypratiaType: note\n/);
  assert.match(out, /\nBody content\.$/);
});

await check('overwrites a stale title on the next sync', () => {
  const first = mergeMarkdownWithHypratia(
    '',
    { hypratia_id: 'n1' },
    'B',
    { set: { id: 'n1', title: 'Old' } },
  );
  const second = mergeMarkdownWithHypratia(
    first,
    { hypratia_id: 'n1' },
    'B',
    { set: { id: 'n1', title: 'New' } },
  );
  assert.match(second, /\ntitle: New\n/);
  assert.doesNotMatch(second, /title: Old/);
});

await check('publicPatch.set with `undefined` removes the key', () => {
  const first = mergeMarkdownWithHypratia(
    '',
    { hypratia_id: 'n1' },
    'B',
    { set: { id: 'n1', title: 'X' } },
  );
  const second = mergeMarkdownWithHypratia(
    first,
    { hypratia_id: 'n1' },
    'B',
    { set: { title: undefined } },
  );
  assert.doesNotMatch(second, /title:/);
});

// ---------------------------------------------------------------------------
section('mergeMarkdownWithHypratia — ensureAliases (merge with user entries)');

await check('first sync seeds aliases from ensureAliases', () => {
  const out = mergeMarkdownWithHypratia(
    '',
    { hypratia_id: 'n1' },
    'B',
    { ensureAliases: ['My Note', 'node-n1'] },
  );
  assert.match(out, /\naliases: \[My Note, node-n1\]\n/);
});

await check('user-added aliases survive a Hypratia sync', () => {
  const userAuthored = `---
title: "User Title"
aliases: [User-Picked Alias, Another One]
---

Body.`;
  const out = mergeMarkdownWithHypratia(
    userAuthored,
    { hypratia_id: 'n1' },
    'Body.',
    {
      set: { id: 'n1', title: 'Hypratia Title' },
      ensureAliases: ['Hypratia Title', 'node-n1'],
    },
  );
  // Order: user entries first (preserved), Hypratia entries appended.
  // Dupe-resistant: if "Hypratia Title" was already user-added, it
  // won't appear twice.
  assert.match(out, /\naliases: \[/);
  // The user's entries come first.
  const aliasLine = out.match(/^aliases: \[(.*)\]$/m)?.[1] ?? '';
  const indexOfUser = aliasLine.indexOf('User-Picked Alias');
  const indexOfHypratia = aliasLine.indexOf('Hypratia Title');
  assert.ok(indexOfUser >= 0, 'user alias preserved');
  assert.ok(indexOfHypratia >= 0, 'hypratia alias added');
  assert.ok(
    indexOfUser < indexOfHypratia,
    'user aliases come first',
  );
  assert.match(out, /node-n1/, 'node-n1 alias added');
});

await check('ensureAliases dedupes when title already in user aliases', () => {
  const userAuthored = `---
aliases: [Shared Title, "Other"]
---

B`;
  const out = mergeMarkdownWithHypratia(
    userAuthored,
    {},
    'B',
    { ensureAliases: ['Shared Title', 'node-n1'] },
  );
  const aliasLine = out.match(/^aliases: \[(.*)\]$/m)?.[1] ?? '';
  // "Shared Title" must appear exactly once.
  const occurrences = aliasLine.split(/,\s*/).filter(
    (s) => s.replace(/['"]/g, '').trim() === 'Shared Title',
  ).length;
  assert.equal(occurrences, 1, 'no duplicate "Shared Title"');
});

await check('handles a string-form aliases value (Obsidian also writes that shape)', () => {
  const userAuthored = `---
aliases: Just A String
---

B`;
  const out = mergeMarkdownWithHypratia(
    userAuthored,
    {},
    'B',
    { ensureAliases: ['Hypratia Added'] },
  );
  // Coerced to a list; both entries present.
  assert.match(out, /Just A String/);
  assert.match(out, /Hypratia Added/);
});

// ---------------------------------------------------------------------------
section('end-to-end: round-trip a sidecar through the merge');

await check('toJsonCanvas → mergeMarkdownWithHypratia produces full Obsidian-friendly file', () => {
  const node = makeNode({
    id: 'n1',
    title: 'Hypratia の思想',
    contentMarkdown: LONG_BODY,
    tags: ['hypratia', 'idea'],
  });
  const { sidecars } = toJsonCanvas([node], [], { notesDir: NOTES_DIR });
  const sidecar = findSidecar(sidecars, 'n1')!;
  const file = mergeMarkdownWithHypratia(
    '',
    sidecar.patch,
    sidecar.body,
    sidecar.publicPatch,
  );
  // Internal identity present.
  assert.match(file, /\nhypratia_id: n1\n/);
  assert.match(file, /\nhypratia_kind: markdown\n/);
  // Public identity present.
  assert.match(file, /\nid: n1\n/);
  assert.match(file, /\ntitle: Hypratia の思想\n/);
  assert.match(file, /\nhypratiaType: note\n/);
  // Aliases include both forms.
  assert.match(file, /aliases: \[/);
  assert.match(file, /Hypratia の思想/);
  assert.match(file, /node-n1/);
  // H1 in the body.
  assert.match(file, /\n# Hypratia の思想\n/);
});

console.log(`\n✓ ${passed} sidecar-frontmatter checks passed.\n`);
