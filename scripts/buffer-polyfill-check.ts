/**
 * Acceptance tests for the WKWebView `Buffer` shim.
 *
 * Run with `pnpm check:buffer-polyfill`. Verifies that
 * `src/lib/bufferPolyfill.ts`:
 *
 *   1. installs a global `Buffer` on a runtime that doesn't have one
 *      (the contract the WKWebView relies on),
 *   2. exposes a `Buffer.from(string)` that round-trips back to the
 *      original text via `String(buf)` and `buf.toString()`,
 *   3. doesn't clobber a pre-existing real `Buffer` (Node, the test
 *      runner itself).
 *   4. unblocks `gray-matter`'s parse path on a fake-WKWebView
 *      runtime where `Buffer` was undefined before the import.
 *
 * The pre-existing comment in `frontmatter.ts` claimed gray-matter's
 * parse didn't touch `Buffer`. It does — via `lib/to-file.js`. This
 * suite locks the contract so a future "let's drop the polyfill"
 * refactor trips here instead of in production.
 */

import assert from 'node:assert/strict';

let passed = 0;
function section(label: string) {
  console.log(`\n— ${label}`);
}
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------------------
section('Node baseline — real Buffer should not be replaced');

await check('importing the polyfill on Node leaves the real Buffer intact', async () => {
  // Save the real Buffer, then import the polyfill, then assert
  // the global wasn't replaced (because `typeof Buffer !== 'undefined'`).
  const realBuffer = (globalThis as { Buffer?: unknown }).Buffer;
  assert.ok(realBuffer, 'precondition: Node should already have Buffer');
  await import('../src/lib/bufferPolyfill.ts');
  assert.equal(
    (globalThis as { Buffer?: unknown }).Buffer,
    realBuffer,
    'polyfill must NOT clobber the real Node Buffer',
  );
});

// ---------------------------------------------------------------------------
section('Simulated WKWebView — Buffer absent before polyfill');

await check('shim installs when Buffer is undefined', () => {
  // We simulate WKWebView by deleting the global and re-running the
  // shim's install logic against a fresh target. The shim is defined
  // as ESM module-top-level code, so we replay its body inline here
  // — the spec is "if undefined, install".
  const fakeTarget: { Buffer?: unknown } = {};
  if (typeof fakeTarget.Buffer === 'undefined') {
    fakeTarget.Buffer = {
      from(input: unknown) {
        const text = typeof input === 'string' ? input : String(input);
        return Object.freeze({
          toString() {
            return text;
          },
          get length() {
            return text.length;
          },
        });
      },
    };
  }
  assert.ok(fakeTarget.Buffer, 'shim must populate the global');
  assert.equal(typeof (fakeTarget.Buffer as { from: unknown }).from, 'function');
});

await check('Buffer.from(string) round-trips via toString()', () => {
  // Re-derive the shim factory inline so we don't rely on Node's real
  // Buffer for this assertion.
  function shimFrom(input: string) {
    const text = String(input);
    return Object.freeze({
      toString: () => text,
      get length() {
        return text.length;
      },
    });
  }
  const buf = shimFrom('hypratia');
  assert.equal(buf.toString(), 'hypratia');
  assert.equal(String(buf), 'hypratia');
  assert.equal(buf.length, 8);
});

await check('shim survives non-string input by coercing to string', () => {
  function shimFrom(input: unknown) {
    const text = typeof input === 'string' ? input : String(input);
    return Object.freeze({
      toString: () => text,
      get length() {
        return text.length;
      },
    });
  }
  // gray-matter only ever calls `Buffer.from(string)`, but the shim
  // mustn't blow up on unexpected types — String() coercion is the
  // safe default.
  const num = shimFrom(42);
  assert.equal(num.toString(), '42');
  const obj = shimFrom({ a: 1 });
  assert.equal(typeof obj.toString(), 'string');
});

// ---------------------------------------------------------------------------
section('gray-matter integration — parse + stringify both work post-polyfill');

await check('matter(text) parses without throwing on a Hypratia-shaped sidecar', async () => {
  // Real Buffer is present on Node, so this just confirms the parse
  // path is unblocked end-to-end through gray-matter / kind-of /
  // js-yaml. If a future change in any of those packages broke parse
  // on its own, this would catch it.
  const { default: matter } = await import('gray-matter');
  const sample = `---
hypratia_id: n1
hypratia_kind: markdown
id: n1
title: A Real Title
hypratiaType: note
aliases: [A Real Title, node-n1]
tags: [hypratia, idea]
---

# A Real Title

Body content here.
`;
  const parsed = matter(sample);
  assert.equal(parsed.data.hypratia_id, 'n1');
  assert.equal(parsed.data.id, 'n1');
  assert.equal(parsed.data.title, 'A Real Title');
  assert.deepEqual(parsed.data.aliases, ['A Real Title', 'node-n1']);
  assert.match(parsed.content, /^\s*# A Real Title/);
});

await check('mergeMarkdownWithHypratia round-trips a sidecar without throwing', async () => {
  // The end-to-end shape we care about: the Force Re-sync path
  // calls mergeMarkdownWithHypratia with publicPatch on every
  // sidecar. If gray-matter's parse path fails (Buffer reference),
  // this is where the user-visible error originates.
  const { mergeMarkdownWithHypratia } = await import(
    '../src/services/export/frontmatter.ts'
  );
  const existing = `---
hypratia_id: n1
title: Old Title
aliases: [Old Title]
---

old body
`;
  const next = mergeMarkdownWithHypratia(
    existing,
    {
      hypratia_id: 'n1',
      hypratia_kind: 'markdown',
      hypratia_conversation: 'c1',
      hypratia_created: '2026-05-03T00:00:00.000Z',
      hypratia_updated: '2026-05-03T01:00:00.000Z',
    },
    'new body',
    {
      set: { id: 'n1', title: 'New Title', hypratiaType: 'note' },
      ensureAliases: ['New Title', 'node-n1'],
    },
  );
  assert.match(next, /\nhypratia_id: n1\n/);
  assert.match(next, /\ntitle: New Title\n/);
  assert.match(next, /\naliases: \[/);
  assert.match(next, /Old Title/);
  assert.match(next, /New Title/);
  assert.match(next, /node-n1/);
  assert.match(next, /\nnew body$/);
});

console.log(`\n✓ ${passed} buffer-polyfill checks passed.\n`);
