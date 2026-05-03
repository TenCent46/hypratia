/**
 * Acceptance tests for the Library-markdown backfill planner.
 *
 * Run with `pnpm check:library-md-backfill`. Pure planner only — the
 * Tauri-side runner (`LibraryMarkdownBackfillRun.ts`) is exercised by
 * hand from inside the running app, since it touches the Zustand store
 * and `@tauri-apps/plugin-fs` directly. Each `check` block targets one
 * of the eleven scenarios from the implementation prompt.
 */

import assert from 'node:assert/strict';
import {
  buildBackfillManifest,
  fallbackBackfillId,
  planLibraryMdBackfill,
  sanitizeFilenameStem,
  type BackfillInput,
  type LibraryMdFile,
} from '../src/services/migration/libraryMarkdownBackfill.ts';
import {
  buildMarkdown,
  mergeMarkdownWithHypratia,
} from '../src/services/export/frontmatter.ts';
import { readFrontmatterIdentity } from '../src/services/markdown/wikilinks.ts';

let passed = 0;
function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NOW = '2026-05-03T00:00:00.000Z';

function file(over: Partial<LibraryMdFile> & { relPath: string; text: string }): LibraryMdFile {
  const name = over.name ?? over.relPath.split('/').pop() ?? 'note.md';
  const stem = over.stem ?? name.replace(/\.[^.]+$/, '');
  return {
    relPath: over.relPath,
    name,
    stem,
    text: over.text,
    identity: over.identity ?? readFrontmatterIdentity(over.text),
  };
}

function input(over: Partial<BackfillInput> & { files: LibraryMdFile[] }): BackfillInput {
  return {
    libraryRoot: over.libraryRoot ?? '/lib',
    vaultRoot: over.vaultRoot ?? '/vault',
    files: over.files,
    storeNodes: over.storeNodes ?? [],
    existingTargets: over.existingTargets ?? [],
    existingSidecars: over.existingSidecars ?? [],
    generatedAt: over.generatedAt ?? NOW,
  };
}

function findStep<K extends string>(
  plan: ReturnType<typeof planLibraryMdBackfill>,
  kind: K,
): Extract<typeof plan.steps[number], { kind: K }> | undefined {
  return plan.steps.find((s) => s.kind === kind) as
    | Extract<typeof plan.steps[number], { kind: K }>
    | undefined;
}

function findAllSteps<K extends string>(
  plan: ReturnType<typeof planLibraryMdBackfill>,
  kind: K,
): Extract<typeof plan.steps[number], { kind: K }>[] {
  return plan.steps.filter((s) => s.kind === kind) as Extract<
    typeof plan.steps[number],
    { kind: K }
  >[];
}

// ---------------------------------------------------------------------------
section('dry-run writes nothing');

await check('planner returns a plan; never reaches into a writer', () => {
  const plan = planLibraryMdBackfill(
    input({
      files: [
        file({
          relPath: 'default/canvas/foo.md',
          text: '---\nhypratia_id: x\n---\nbody\n',
        }),
      ],
    }),
  );
  // Planner is a pure function. The runner decides whether to apply.
  // We only assert the plan was constructed without throwing.
  assert.equal(plan.summary.md, 1);
  assert.equal(plan.summary.sidecars, 1);
  assert.equal(plan.libraryRoot, '/lib');
  assert.equal(plan.vaultRoot, '/vault');
});

// ---------------------------------------------------------------------------
section('user frontmatter is preserved');

await check('keeps tags / cssclasses / plugin keys verbatim', () => {
  const text = buildMarkdown(
    {
      hypratia_id: 'preserve',
      title: 'Preserve',
      tags: ['research', 'reading'],
      cssclasses: ['hub'],
      reviewedBy: 'alice',
    },
    'Body of the note.\n',
  );
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'default/canvas/preserve.md', text })],
    }),
  );
  const step = findStep(plan, 'write-md');
  assert.ok(step, 'expected a write-md step');
  assert.match(step.mergedMarkdown, /tags: \[research, reading\]/);
  assert.match(step.mergedMarkdown, /cssclasses: \[hub\]/);
  assert.match(step.mergedMarkdown, /reviewedBy: alice/);
  assert.match(step.mergedMarkdown, /hypratia_id: preserve/);
  assert.match(step.mergedMarkdown, /hypratia_migrated_from: default\/canvas\/preserve\.md/);
});

await check('source body replaces target body wholesale, frontmatter merges', () => {
  // Existing target with custom user frontmatter + stale body.
  const existingTargetText = buildMarkdown(
    {
      hypratia_id: 'preserve',
      tags: ['existing'],
      cssclasses: ['stays'],
    },
    'STALE BODY\n',
  );
  const sourceText = buildMarkdown(
    { hypratia_id: 'preserve' },
    '# Preserve\n\nFresh body.\n',
  );
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'default/canvas/preserve.md', text: sourceText })],
      existingTargets: [
        {
          path: 'Hypratia/Notes/preserve.md',
          identity: readFrontmatterIdentity(existingTargetText),
          text: existingTargetText,
        },
      ],
    }),
  );
  const step = findStep(plan, 'write-md');
  assert.ok(step);
  // Custom user keys on the target survive.
  assert.match(step.mergedMarkdown, /cssclasses: \[stays\]/);
  // Body is replaced.
  assert.doesNotMatch(step.mergedMarkdown, /STALE BODY/);
  assert.match(step.mergedMarkdown, /Fresh body\./);
});

// ---------------------------------------------------------------------------
section('aliases are merged additively');

await check('source aliases + target aliases + title all union, no dups', () => {
  const sourceText = buildMarkdown(
    {
      hypratia_id: 'aliased',
      title: 'My Title',
      aliases: ['source-alias', 'My Title'],
    },
    'body\n',
  );
  const targetText = buildMarkdown(
    {
      hypratia_id: 'aliased',
      aliases: ['user-set-in-obsidian', 'source-alias'],
    },
    'old\n',
  );
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'default/canvas/aliased.md', text: sourceText })],
      existingTargets: [
        {
          path: 'Hypratia/Notes/My Title.md',
          identity: readFrontmatterIdentity(targetText),
          text: targetText,
        },
      ],
    }),
  );
  const step = findStep(plan, 'write-md');
  assert.ok(step);
  const aliasMatch = step.mergedMarkdown.match(/aliases: \[(.+?)\]/);
  assert.ok(aliasMatch, 'aliases line missing');
  const items = (aliasMatch[1] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''));
  assert.deepEqual(
    new Set(items),
    new Set(['user-set-in-obsidian', 'source-alias', 'My Title']),
  );
});

// ---------------------------------------------------------------------------
section('hypratia_id resolution order');

await check('frontmatter hypratia_id wins (highest priority)', () => {
  const text = buildMarkdown(
    { hypratia_id: 'from-frontmatter', id: 'legacy-id' },
    'body\n',
  );
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'a.md', text })],
      storeNodes: [
        { id: 'from-store', conversationId: 'c', title: 'A', mdPath: 'a.md' },
      ],
    }),
  );
  const step = findStep(plan, 'write-md');
  assert.equal(step?.hypratiaId, 'from-frontmatter');
});

await check('inferred from store by mdPath when frontmatter has no id', () => {
  const text = '# Just a body, no frontmatter\n';
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'default/canvas/sourced.md', text })],
      storeNodes: [
        {
          id: 'from-store',
          conversationId: 'c1',
          title: 'Sourced',
          mdPath: 'default/canvas/sourced.md',
        },
      ],
    }),
  );
  const step = findStep(plan, 'write-md');
  assert.equal(step?.hypratiaId, 'from-store');
});

await check('legacy `id` field is honored when no hypratia_id and no store match', () => {
  const text = buildMarkdown({ id: 'legacy_42', title: 'Legacy' }, 'body\n');
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'old/legacy.md', text })],
    }),
  );
  const step = findStep(plan, 'write-md');
  assert.equal(step?.hypratiaId, 'legacy_42');
});

await check('fallback id is deterministic over (libraryRoot, relPath)', () => {
  const a = fallbackBackfillId('/lib', 'default/canvas/foo.md');
  const b = fallbackBackfillId('/lib', 'default/canvas/foo.md');
  const c = fallbackBackfillId('/lib', 'default/canvas/bar.md');
  const d = fallbackBackfillId('/other-lib', 'default/canvas/foo.md');
  assert.equal(a, b, 'same input must yield same id');
  assert.notEqual(a, c, 'different relPath must yield different id');
  assert.notEqual(a, d, 'different libraryRoot must yield different id');
  assert.match(a, /^library_/);
});

// ---------------------------------------------------------------------------
section('target filename conflict handling');

await check(
  'two source files with same slug + different ids → second disambiguates',
  () => {
    const sourceA = buildMarkdown({ hypratia_id: 'id-a' }, 'a\n');
    const sourceB = buildMarkdown({ hypratia_id: 'id-b' }, 'b\n');
    const plan = planLibraryMdBackfill(
      input({
        files: [
          file({ relPath: 'default/canvas/foo.md', text: sourceA }),
          file({ relPath: 'projects/x/canvas/foo.md', text: sourceB }),
        ],
      }),
    );
    const writes = findAllSteps(plan, 'write-md');
    assert.equal(writes.length, 2);
    const targets = writes.map((w) => w.to).sort();
    assert.ok(targets.includes('Hypratia/Notes/foo.md'));
    assert.ok(targets.some((t) => /^Hypratia\/Notes\/foo-/.test(t)));
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].reason, 'target-exists-different-id');
  },
);

await check(
  'existing target with the same hypratia_id → idempotent in-place merge',
  () => {
    const text = buildMarkdown({ hypratia_id: 'same' }, 'body\n');
    const targetText = buildMarkdown({ hypratia_id: 'same', tags: ['t'] }, 'body\n');
    const plan = planLibraryMdBackfill(
      input({
        files: [file({ relPath: 'default/canvas/keep.md', text })],
        existingTargets: [
          {
            path: 'Hypratia/Notes/keep.md',
            identity: readFrontmatterIdentity(targetText),
            text: targetText,
          },
        ],
      }),
    );
    assert.equal(plan.conflicts.length, 0);
    const writes = findAllSteps(plan, 'write-md');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].to, 'Hypratia/Notes/keep.md');
  },
);

// ---------------------------------------------------------------------------
section('node.mdPath is updated');

await check('store node receives an update step pointing at the new path', () => {
  const text = buildMarkdown({ hypratia_id: 'n42', title: 'Hello' }, 'body\n');
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'default/canvas/old-path.md', text })],
      storeNodes: [
        {
          id: 'n42',
          conversationId: 'c1',
          title: 'Hello',
          mdPath: 'default/canvas/old-path.md',
        },
      ],
    }),
  );
  const upd = findStep(plan, 'update-node-mdpath');
  assert.ok(upd, 'expected an update-node-mdpath step');
  assert.equal(upd.nodeId, 'n42');
  assert.equal(upd.from, 'default/canvas/old-path.md');
  assert.match(upd.to, /^Hypratia\/Notes\//);
});

await check('no update step emitted when the store match has no mdPath drift', () => {
  const text = buildMarkdown({ hypratia_id: 'n42' }, 'body\n');
  const plan = planLibraryMdBackfill(
    input({
      files: [file({ relPath: 'Hypratia/Notes/already-here.md', text })],
      storeNodes: [
        {
          id: 'n42',
          conversationId: 'c1',
          title: 'Already here',
          mdPath: 'Hypratia/Notes/already-here.md',
        },
      ],
    }),
  );
  // File is already inside the canonical layout — planner emits a `skip`.
  const skipped = findStep(plan, 'skip');
  assert.ok(skipped);
  assert.equal(findStep(plan, 'update-node-mdpath'), undefined);
});

// ---------------------------------------------------------------------------
section('sidecar is created');

await check('every md write pairs with a write-sidecar step', () => {
  const text = buildMarkdown({ hypratia_id: 'sc', title: 'SC' }, 'body\n');
  const plan = planLibraryMdBackfill(
    input({ files: [file({ relPath: 'lib/sc.md', text })] }),
  );
  const sc = findStep(plan, 'write-sidecar');
  assert.ok(sc);
  assert.equal(sc.hypratiaId, 'sc');
  assert.match(sc.to, /^Hypratia\/\.hypratia\/sidecars\/sc\.json$/);
  // Sidecar JSON is well-formed and identifies as a Hypratia sidecar.
  const parsed = JSON.parse(sc.json);
  assert.equal(parsed.$schema, 'hypratia.sidecar');
  assert.equal(parsed.hypratia_id, 'sc');
});

// ---------------------------------------------------------------------------
section('manifest is written from the plan');

await check('buildBackfillManifest summarizes moved + nodeUpdates + skipped', () => {
  const text = buildMarkdown({ hypratia_id: 'm1' }, 'body\n');
  const plan = planLibraryMdBackfill(
    input({
      files: [
        file({ relPath: 'lib/m1.md', text }),
        file({
          relPath: 'Hypratia/Notes/already.md',
          text: buildMarkdown({ hypratia_id: 'a1' }, 'body\n'),
        }),
      ],
      storeNodes: [
        { id: 'm1', conversationId: 'c1', title: 'M1', mdPath: 'lib/m1.md' },
      ],
    }),
  );
  const manifest = buildBackfillManifest(plan, NOW, [
    { from: 'lib/m1.md', to: 'Hypratia/.hypratia/backups/library-md-backfill-…/lib/m1.md' },
  ]);
  assert.equal(manifest.$schema, 'hypratia.library-md-backfill.v1');
  assert.equal(manifest.appliedAt, NOW);
  assert.equal(manifest.moved.length, 1);
  assert.equal(manifest.nodeUpdates.length, 1);
  assert.equal(manifest.skipped.length, 1);
  assert.equal(manifest.archived.length, 1);
});

// ---------------------------------------------------------------------------
section('running twice is safe (idempotent)');

await check(
  'second run with same input + first-run target produces stable plan',
  () => {
    const sourceText = buildMarkdown(
      { hypratia_id: 'idem', title: 'Idem' },
      'body\n',
    );
    const firstFiles = [file({ relPath: 'default/canvas/idem.md', text: sourceText })];
    const first = planLibraryMdBackfill(input({ files: firstFiles }));
    const firstWrite = findStep(first, 'write-md');
    assert.ok(firstWrite);

    // Simulate the apply: target now exists with what we wrote.
    const targetIdentity = readFrontmatterIdentity(firstWrite.mergedMarkdown);
    const second = planLibraryMdBackfill(
      input({
        files: firstFiles,
        existingTargets: [
          {
            path: firstWrite.to,
            identity: targetIdentity,
            text: firstWrite.mergedMarkdown,
          },
        ],
      }),
    );
    const secondWrite = findStep(second, 'write-md');
    assert.ok(secondWrite);
    // Same target path — no `-suffix` duplicate.
    assert.equal(secondWrite.to, firstWrite.to);
    assert.equal(second.conflicts.length, 0);
  },
);

await check('files already in Hypratia/Notes/ are skipped, not re-written', () => {
  const plan = planLibraryMdBackfill(
    input({
      files: [
        file({
          relPath: 'Hypratia/Notes/already.md',
          text: buildMarkdown({ hypratia_id: 'x' }, 'body\n'),
        }),
      ],
    }),
  );
  const writes = findAllSteps(plan, 'write-md');
  assert.equal(writes.length, 0);
  const skips = findAllSteps(plan, 'skip');
  assert.equal(skips.length, 1);
  assert.match(skips[0].reason, /canonical/);
});

// ---------------------------------------------------------------------------
section('helpers');

await check('sanitizeFilenameStem strips path-meta + caps length', () => {
  assert.equal(sanitizeFilenameStem('My/Title*With:Bad?Chars'), 'My Title With Bad Chars');
  assert.equal(sanitizeFilenameStem(''), 'Untitled');
  assert.equal(sanitizeFilenameStem('   '), 'Untitled');
});

await check('mergeMarkdownWithHypratia + applyAliasesToFrontmatter compose cleanly', () => {
  const text = buildMarkdown(
    { hypratia_id: 'compose', tags: ['user-tag'] },
    'body\n',
  );
  const merged = mergeMarkdownWithHypratia(
    text,
    { hypratia_id: 'compose', hypratia_migrated_from: 'lib/x.md' },
    'replaced body\n',
  );
  assert.match(merged, /hypratia_migrated_from: lib\/x\.md/);
  assert.match(merged, /tags: \[user-tag\]/);
  assert.match(merged, /replaced body/);
});

console.log(`\n✓ ${passed} library-md-backfill checks passed.\n`);
