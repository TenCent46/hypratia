/**
 * Acceptance tests for the legacy-vault migration tool.
 *
 * Run with `pnpm check:migration`. Each test creates an isolated temp
 * vault, populates it with legacy fixtures, calls `runMigration`, and
 * asserts the resulting filesystem state. Cleans up after itself.
 */

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runMigration } from './migrate-legacy-vault.ts';
import {
  rewriteCanvasFilePaths,
  rewriteVaultPathPrefix,
} from '../src/services/migration/legacyVaultMigration.ts';

let passed = 0;

function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeVault(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'hypratia-mig-'));
}
function rmVault(vault: string) {
  rmSync(vault, { recursive: true, force: true });
}
function write(vault: string, rel: string, content: string) {
  const abs = path.join(vault, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}
function read(vault: string, rel: string): string {
  return readFileSync(path.join(vault, rel), 'utf8');
}
function exists(vault: string, rel: string): boolean {
  return existsSync(path.join(vault, rel));
}

// ---------------------------------------------------------------------------
section('dry-run writes nothing');

await check('dry-run leaves the vault untouched', async () => {
  const vault = makeVault();
  try {
    write(
      vault,
      'LLM-Nodes/foo.md',
      `---\nid: foo\ntitle: Foo\n---\n# Foo\n\nBody.\n`,
    );
    const result = await runMigration({
      vaultRoot: vault,
      dryRun: true,
      now: '2026-05-03T00:00:00.000Z',
      silent: true,
    });
    assert.equal(result.applied, false);
    assert.equal(exists(vault, 'Hypratia'), false);
    assert.equal(exists(vault, 'LLM-Nodes/foo.md'), true);
  } finally {
    rmVault(vault);
  }
});

// ---------------------------------------------------------------------------
section('markdown migration preserves user frontmatter');

await check('user keys (tags / cssclasses / plugin keys) survive', async () => {
  const vault = makeVault();
  try {
    write(
      vault,
      'LLM-Nodes/keep.md',
      `---\nid: keep\ntitle: Keep\ntags: [research, reading]\ncssclasses: [hub]\nfooter: my-plugin-key\n---\n# Keep\n\nBody.\n`,
    );
    const result = await runMigration({
      vaultRoot: vault,
      apply: true,
      now: '2026-05-03T00:00:00.000Z',
      silent: true,
    });
    assert.equal(result.applied, true);
    const out = read(vault, 'Hypratia/Notes/keep.md');
    assert.match(out, /tags: \[research, reading\]/);
    assert.match(out, /cssclasses: \[hub\]/);
    assert.match(out, /footer: my-plugin-key/);
    assert.match(out, /hypratia_id: keep/);
    assert.match(out, /hypratia_kind: note/);
    assert.match(out, /hypratia_migrated_from: LLM-Nodes\/keep\.md/);
  } finally {
    rmVault(vault);
  }
});

await check('aliases are merged additively without duplication', async () => {
  const vault = makeVault();
  try {
    write(
      vault,
      'LLM-Nodes/aliased.md',
      `---\nid: aliased\ntitle: My Title\naliases: ["My Title", custom-alias]\n---\nBody.\n`,
    );
    await runMigration({
      vaultRoot: vault,
      apply: true,
      now: '2026-05-03T00:00:00.000Z',
      silent: true,
    });
    const out = read(vault, 'Hypratia/Notes/aliased.md');
    // The merged aliases line includes both, exactly once each.
    const aliasMatch = out.match(/aliases: \[(.+?)\]/);
    assert.ok(aliasMatch, 'no aliases line written');
    const items = (aliasMatch[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''));
    assert.deepEqual(new Set(items), new Set(['My Title', 'custom-alias']));
  } finally {
    rmVault(vault);
  }
});

// ---------------------------------------------------------------------------
section('canvas file paths are rewritten');

await check('JSON Canvas `nodes[].file` paths go through the rewriter', async () => {
  const canvas = JSON.stringify(
    {
      nodes: [
        { id: 'a', type: 'file', file: 'LLM-Nodes/foo.md', x: 0, y: 0, width: 200, height: 100 },
        { id: 'b', type: 'file', file: 'LLM-Attachments/img.png', x: 0, y: 0, width: 200, height: 100 },
        { id: 'c', type: 'text', text: 'hi', x: 0, y: 0, width: 200, height: 100 },
      ],
      edges: [],
    },
    null,
    2,
  );
  const out = rewriteCanvasFilePaths(canvas);
  assert.match(out, /"file": "Hypratia\/Notes\/foo\.md"/);
  assert.match(out, /"file": "Hypratia\/Attachments\/img\.png"/);
  // text node untouched
  assert.match(out, /"text": "hi"/);
});

await check('rewriter is a no-op on malformed JSON', () => {
  const out = rewriteCanvasFilePaths('not json {');
  assert.equal(out, 'not json {');
});

await check('vault prefix rewriter handles every legacy folder', () => {
  assert.equal(
    rewriteVaultPathPrefix('LLM-Conversations/x.md'),
    'Hypratia/Notes/x.md',
  );
  assert.equal(
    rewriteVaultPathPrefix('LLM-Daily/2026-05.md'),
    'Hypratia/Daily/2026-05.md',
  );
  assert.equal(
    rewriteVaultPathPrefix('Hypratia/Notes/keep.md'),
    'Hypratia/Notes/keep.md',
  );
});

// ---------------------------------------------------------------------------
section('attachments are copied');

await check('LLM-Attachments → Hypratia/Attachments preserves bytes', async () => {
  const vault = makeVault();
  try {
    write(vault, 'LLM-Attachments/img.png', 'IMAGE-BYTES-PLACEHOLDER');
    await runMigration({
      vaultRoot: vault,
      apply: true,
      now: '2026-05-03T00:00:00.000Z',
      silent: true,
    });
    assert.equal(exists(vault, 'Hypratia/Attachments/img.png'), true);
    assert.equal(
      read(vault, 'Hypratia/Attachments/img.png'),
      'IMAGE-BYTES-PLACEHOLDER',
    );
  } finally {
    rmVault(vault);
  }
});

// ---------------------------------------------------------------------------
section('sidecars are created');

await check('every migrated md gets a sidecar under .hypratia/sidecars', async () => {
  const vault = makeVault();
  try {
    write(vault, 'LLM-Nodes/x.md', `---\nid: x\ntitle: X\n---\nBody.\n`);
    await runMigration({
      vaultRoot: vault,
      apply: true,
      now: '2026-05-03T00:00:00.000Z',
      silent: true,
    });
    assert.equal(exists(vault, 'Hypratia/.hypratia/sidecars/x.json'), true);
    const sidecar = JSON.parse(read(vault, 'Hypratia/.hypratia/sidecars/x.json'));
    assert.equal(sidecar.$schema, 'hypratia.sidecar');
    assert.equal(sidecar.hypratia_id, 'x');
    assert.equal(sidecar.hypratia_migrated_from, 'LLM-Nodes/x.md');
  } finally {
    rmVault(vault);
  }
});

// ---------------------------------------------------------------------------
section('running migration twice is safe (idempotent)');

await check(
  'second run produces the same vault state, no duplicate files',
  async () => {
    const vault = makeVault();
    try {
      write(vault, 'LLM-Nodes/idem.md', `---\nid: idem\ntitle: Idem\n---\nBody.\n`);
      const opts = {
        vaultRoot: vault,
        apply: true,
        now: '2026-05-03T00:00:00.000Z' as const,
        silent: true,
      };
      await runMigration(opts);
      const after1 = read(vault, 'Hypratia/Notes/idem.md');
      const sidecar1 = read(vault, 'Hypratia/.hypratia/sidecars/idem.json');
      await runMigration(opts);
      const after2 = read(vault, 'Hypratia/Notes/idem.md');
      const sidecar2 = read(vault, 'Hypratia/.hypratia/sidecars/idem.json');
      assert.equal(after1, after2);
      assert.equal(sidecar1, sidecar2);
      // No -<suffix>.md duplicates.
      const notes = readdirSync(path.join(vault, 'Hypratia/Notes'));
      assert.deepEqual(notes, ['idem.md']);
    } finally {
      rmVault(vault);
    }
  },
);

// ---------------------------------------------------------------------------
section('filename collision with different hypratia_id');

await check(
  'two legacy files with same name + different ids → second one disambiguates',
  async () => {
    const vault = makeVault();
    try {
      // Same `foo.md` lives under both LLM-Nodes (folder maps to Notes) AND
      // LLM-Conversations (folder also maps to Notes). Both target
      // `Hypratia/Notes/foo.md` — only one can win.
      write(
        vault,
        'LLM-Nodes/foo.md',
        `---\nid: id-from-nodes\ntitle: Foo from Nodes\n---\nBody A.\n`,
      );
      write(
        vault,
        'LLM-Conversations/foo.md',
        `---\nid: id-from-conv\ntitle: Foo from Conv\n---\nBody B.\n`,
      );
      const result = await runMigration({
        vaultRoot: vault,
        apply: true,
        now: '2026-05-03T00:00:00.000Z',
        silent: true,
      });
      assert.equal(exists(vault, 'Hypratia/Notes/foo.md'), true);
      // The second file lands at a disambiguated filename — exact suffix
      // is opaque (it's an id-derived hash), so just assert that some
      // file in Notes/ uses the `foo-…` form alongside the canonical
      // `foo.md`.
      const files = readdirSync(path.join(vault, 'Hypratia/Notes'));
      assert.equal(files.length, 2);
      assert.ok(
        files.includes('foo.md'),
        `expected foo.md among ${files.join(', ')}`,
      );
      assert.ok(
        files.some((f) => /^foo-.+\.md$/.test(f)),
        `expected a foo-<suffix>.md sibling among ${files.join(', ')}`,
      );
      // The conflict shows up in the plan.
      assert.equal(result.plan.conflicts.length, 1);
      assert.equal(result.plan.conflicts[0].reason, 'target-exists-different-id');
    } finally {
      rmVault(vault);
    }
  },
);

// ---------------------------------------------------------------------------
section('legacy folders are not deleted unless --archive-old is passed');

await check('default apply: legacy folders survive', async () => {
  const vault = makeVault();
  try {
    write(vault, 'LLM-Nodes/x.md', `---\nid: x\n---\nBody.\n`);
    await runMigration({
      vaultRoot: vault,
      apply: true,
      now: '2026-05-03T00:00:00.000Z',
      silent: true,
    });
    assert.equal(exists(vault, 'LLM-Nodes/x.md'), true);
    assert.equal(exists(vault, 'LLM-Nodes'), true);
  } finally {
    rmVault(vault);
  }
});

await check(
  '--archive-old moves legacy folders into .hypratia/backups/',
  async () => {
    const vault = makeVault();
    try {
      write(vault, 'LLM-Nodes/x.md', `---\nid: x\n---\nBody.\n`);
      write(vault, 'LLM-Attachments/y.png', 'BYTES');
      const result = await runMigration({
        vaultRoot: vault,
        apply: true,
        archiveOld: true,
        now: '2026-05-03T00:00:00.000Z',
        silent: true,
      });
      assert.equal(exists(vault, 'LLM-Nodes'), false);
      assert.equal(exists(vault, 'LLM-Attachments'), false);
      assert.ok(result.archived);
      assert.equal(
        statSync(path.join(vault, result.archived!, 'LLM-Nodes/x.md')).isFile(),
        true,
      );
    } finally {
      rmVault(vault);
    }
  },
);

console.log(`\n✓ ${passed} migration checks passed.\n`);
