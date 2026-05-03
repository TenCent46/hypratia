/**
 * Acceptance tests for `dispatchWikilinkResolution`. Pure dispatcher; we
 * install a tiny EventTarget on `globalThis.window` and assert which
 * events it receives for each `WikilinkResolution` shape.
 *
 * Run with `pnpm check:wikilink-dispatch`. Together with the resolver
 * tests, this covers the click-flow contract end-to-end:
 *
 *   open-node     → mc:open-canvas-node + mc:open-markdown-file
 *   open-markdown → mc:open-markdown-file
 *   ambiguous     → mc:wikilink-chooser-open
 *   unresolved    → mc:create-kb-note
 *
 * Crucially: the dispatcher MUST NOT emit `mc:focus-canvas-node` directly
 * for `open-node` — that's the App-level handler's job so the canvas pane
 * gets revealed first when it's hidden.
 */

import assert from 'node:assert/strict';

type Captured = { type: string; detail: unknown };

const captured: Captured[] = [];
// Minimal EventTarget shim. Node 22 ships `EventTarget` as a global, so we
// just instantiate one and route into our buffer.
const target = new EventTarget();
target.addEventListener = ((
  origAddEventListener: typeof EventTarget.prototype.addEventListener,
) =>
  function (
    this: EventTarget,
    type: string,
    listener: EventListener | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    return origAddEventListener.call(this, type, listener, options);
  })(target.addEventListener.bind(target));
const origDispatch = target.dispatchEvent.bind(target);
target.dispatchEvent = (event: Event) => {
  if (event instanceof CustomEvent) {
    captured.push({ type: event.type, detail: event.detail });
  } else {
    captured.push({ type: event.type, detail: undefined });
  }
  return origDispatch(event);
};
(globalThis as { window?: EventTarget }).window = target;

// Now import the dispatcher (after the shim is installed so it sees a
// well-formed `globalThis.window` if the module ever cached early).
const { dispatchWikilinkResolution } = await import(
  '../src/services/markdown/wikilinkResolver.ts'
);

let passed = 0;
function section(label: string) {
  console.log(`\n— ${label}`);
}
function check(name: string, fn: () => void) {
  captured.length = 0;
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------------------
section('open-node — high-level + companion markdown event');

check(
  'fires mc:open-canvas-node first, then mc:open-markdown-file',
  () => {
    dispatchWikilinkResolution(
      {
        status: 'open-node',
        nodeId: 'node_42',
        conversationId: 'conv_1',
        hypratiaId: 'node_42',
        path: 'Hypratia/Notes/x.md',
        anchor: null,
      },
      'X',
    );
    assert.equal(captured.length, 2);
    assert.equal(captured[0].type, 'mc:open-canvas-node');
    assert.deepEqual(captured[0].detail, {
      nodeId: 'node_42',
      conversationId: 'conv_1',
      hypratiaId: 'node_42',
      path: 'Hypratia/Notes/x.md',
      anchor: null,
    });
    assert.equal(captured[1].type, 'mc:open-markdown-file');
  },
);

check(
  'never emits the low-level mc:focus-canvas-node directly',
  () => {
    dispatchWikilinkResolution(
      {
        status: 'open-node',
        nodeId: 'node_42',
        conversationId: 'conv_1',
        hypratiaId: 'node_42',
        path: 'Hypratia/Notes/x.md',
        anchor: null,
      },
      'X',
    );
    assert.ok(
      !captured.some((e) => e.type === 'mc:focus-canvas-node'),
      'dispatcher must defer to the App-level handler for focus',
    );
  },
);

// ---------------------------------------------------------------------------
section('open-markdown — single event, no canvas-pane disturbance');

check('open-markdown only fires mc:open-markdown-file', () => {
  dispatchWikilinkResolution(
    {
      status: 'open-markdown',
      path: 'Hypratia/Notes/plain.md',
      anchor: null,
      reason: 'no-frontmatter-id',
    },
    'plain',
  );
  assert.equal(captured.length, 1);
  assert.equal(captured[0].type, 'mc:open-markdown-file');
  assert.deepEqual(captured[0].detail, {
    path: 'Hypratia/Notes/plain.md',
    anchor: null,
  });
});

check('open-markdown does NOT emit mc:open-canvas-node', () => {
  dispatchWikilinkResolution(
    {
      status: 'open-markdown',
      path: 'Hypratia/Notes/plain.md',
      anchor: null,
      reason: 'no-matching-node',
    },
    'plain',
  );
  assert.ok(!captured.some((e) => e.type === 'mc:open-canvas-node'));
});

// ---------------------------------------------------------------------------
section('ambiguous — chooser channel only');

check('ambiguous fires mc:wikilink-chooser-open with all candidates', () => {
  dispatchWikilinkResolution(
    {
      status: 'ambiguous',
      query: 'Notes',
      candidates: [
        { path: 'Hypratia/Notes/a.md', title: 'Notes', hypratiaId: 'a', nodeId: 'a', conversationId: 'c1' },
        { path: 'Hypratia/Notes/b.md', title: 'Notes', hypratiaId: 'b', nodeId: 'b', conversationId: 'c1' },
      ],
    },
    'Notes',
  );
  assert.equal(captured.length, 1);
  assert.equal(captured[0].type, 'mc:wikilink-chooser-open');
  const detail = captured[0].detail as {
    query: string;
    candidates: { nodeId?: string }[];
  };
  assert.equal(detail.query, 'Notes');
  assert.equal(detail.candidates.length, 2);
});

// ---------------------------------------------------------------------------
section('unresolved — falls through to the create-note flow');

check('unresolved fires mc:create-kb-note with the query', () => {
  dispatchWikilinkResolution(
    { status: 'unresolved', query: 'Brand New' },
    'Brand New',
  );
  assert.equal(captured.length, 1);
  assert.equal(captured[0].type, 'mc:create-kb-note');
  assert.deepEqual(captured[0].detail, { name: 'Brand New' });
});

check(
  'unresolved with empty query falls back to the raw target',
  () => {
    dispatchWikilinkResolution(
      { status: 'unresolved', query: '' },
      'fallback-target',
    );
    assert.equal(captured[0].type, 'mc:create-kb-note');
    assert.deepEqual(captured[0].detail, { name: 'fallback-target' });
  },
);

// ---------------------------------------------------------------------------
section('low-level event continues to work for direct callers');

check('hand-firing mc:focus-canvas-node still reaches listeners', () => {
  let received: { nodeId?: string } | null = null;
  const handler = (e: Event) =>
    (received = (e as CustomEvent<{ nodeId?: string }>).detail);
  target.addEventListener('mc:focus-canvas-node', handler);
  target.dispatchEvent(
    new CustomEvent('mc:focus-canvas-node', { detail: { nodeId: 'node_99' } }),
  );
  target.removeEventListener('mc:focus-canvas-node', handler);
  assert.deepEqual(received, { nodeId: 'node_99' });
});

console.log(`\n✓ ${passed} dispatch checks passed.\n`);
