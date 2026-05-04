/**
 * Acceptance tests for the Capture path's routing helpers
 * (plan/v1/31, Step 2). Pure-function tests against
 * `src/services/capture/captureRouting.ts` — no React, no Tauri, no
 * store. End-to-end behavioural assertions are simulated by feeding a
 * `RouteDecision` plus fake candidate nodes through `planCaptureRouting`
 * and inspecting the returned plan.
 *
 * Run with `pnpm check:capture-routing`.
 */

import assert from 'node:assert/strict';
import {
  buildCaptureRootDraft,
  captureActiveProjectId,
  extractParentCandidateText,
  planCaptureRouting,
} from '../src/services/capture/captureRouting.ts';
import type { RouteDecision } from '../src/services/ingestRouting/IngestRouter.ts';
import { isThemeRoot } from '../src/services/ingestRouting/IngestRouter.ts';
import type { CanvasNode, Conversation } from '../src/types/index.ts';
import type { ParsedConversation } from '../src/services/capture/PasteCapture.ts';

let passed = 0;

function section(label: string) {
  console.log(`\n— ${label}`);
}

async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeNode(over: Partial<CanvasNode>): CanvasNode {
  return {
    id: over.id ?? 'n1',
    conversationId: over.conversationId ?? 'conv-A',
    // Default to markdown so the test fixtures match the new corrective
    // design (imported roots render as MarkdownNode). Tests that need a
    // live-chat-style ThemeNode pass `kind: 'theme'` explicitly.
    kind: over.kind ?? 'markdown',
    title: over.title ?? 'Existing topic',
    contentMarkdown: over.contentMarkdown ?? '',
    position: over.position ?? { x: 100, y: 200 },
    tags: over.tags ?? ['themeKind:theme', 'imported:conversation'],
    createdAt: over.createdAt ?? '2026-05-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-05-01T00:00:00Z',
    ...over,
  };
}

function makeConversation(over: Partial<Conversation>): Conversation {
  return {
    id: over.id ?? 'conv-A',
    title: over.title ?? 'Untitled',
    createdAt: over.createdAt ?? '2026-05-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-05-01T00:00:00Z',
    messageIds: over.messageIds ?? [],
    ...over,
  };
}

// PasteCapture's ParsedConversation shape — re-declared minimally here
// so the test doesn't drag in PasteCapture (and its regex-only deps).
function parsed(
  turns: { role: 'user' | 'assistant' | 'system'; content: string }[],
  title = 'Pasted conversation',
): ParsedConversation {
  return {
    title,
    turns: turns.map((t, i) => ({ ...t, index: i })),
  };
}

// =====================================================================
// extractParentCandidateText
// =====================================================================

section('extractParentCandidateText');

await check('prefers the first user turn for chat-shaped input', () => {
  const text = extractParentCandidateText(
    parsed([
      { role: 'user', content: 'How do embeddings work?' },
      { role: 'assistant', content: 'They map text to vectors…' },
    ]),
  );
  assert.equal(text, 'How do embeddings work?');
});

await check('falls back to first heading when no user turn', () => {
  const text = extractParentCandidateText(
    parsed([
      {
        role: 'assistant',
        content:
          'Some intro paragraph.\n\n## A heading\n\n## Another heading',
      },
    ]),
  );
  // The first heading is "A heading" — but our regex matches any 1-6 #
  // line, and there is no top-level # in this fixture, so it picks the
  // first `## A heading`.
  assert.equal(text, 'A heading');
});

await check('falls back to first paragraph when no heading', () => {
  const text = extractParentCandidateText(
    parsed([
      {
        role: 'assistant',
        content: 'First paragraph here.\n\nSecond paragraph there.',
      },
    ]),
  );
  assert.equal(text, 'First paragraph here.');
});

await check('falls back to title when nothing else is available', () => {
  const text = extractParentCandidateText(parsed([], 'Bare title'));
  assert.equal(text, 'Bare title');
});

await check('trims whitespace from the user turn', () => {
  const text = extractParentCandidateText(
    parsed([{ role: 'user', content: '   leading and trailing   ' }]),
  );
  assert.equal(text, 'leading and trailing');
});

// =====================================================================
// captureActiveProjectId
// =====================================================================

section('captureActiveProjectId');

await check('returns the active conversation\'s projectId', () => {
  const id = captureActiveProjectId('conv-A', [
    makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
    makeConversation({ id: 'conv-B', projectId: 'proj-2' }),
  ]);
  assert.equal(id, 'proj-1');
});

await check('returns null when conversation is unprojected', () => {
  const id = captureActiveProjectId('conv-A', [
    makeConversation({ id: 'conv-A' }),
  ]);
  assert.equal(id, null);
});

await check('returns null when conversation is missing', () => {
  assert.equal(captureActiveProjectId('conv-X', []), null);
});

// =====================================================================
// buildCaptureRootDraft
// =====================================================================

section('buildCaptureRootDraft');

// Plan/v1/31 corrective design — imported chat / capture roots render
// as the user's familiar MarkdownNode (`kind: 'markdown'`), NOT the
// auto-summary ThemeNode. The `themeKind:theme` tag carries the
// semantic role for routing; renderer dispatch is decoupled.

await check('produces kind:markdown + themeKind:theme tag', () => {
  const draft = buildCaptureRootDraft({
    conversationId: 'conv-A',
    title: 'My topic',
    body: '# My topic\n\nbody',
    position: { x: 0, y: 0 },
  });
  assert.equal(draft.kind, 'markdown');
  assert.ok(draft.tags.includes('themeKind:theme'));
  assert.ok(draft.tags.includes('imported:conversation'));
});

await check('does not use the v1 hypratia / imported tag soup', () => {
  const draft = buildCaptureRootDraft({
    conversationId: 'conv-A',
    title: 'X',
    body: 'X',
    position: { x: 0, y: 0 },
  });
  assert.equal(draft.tags.includes('hypratia'), false);
  // The bare "imported" tag is the v1 marker; the new design uses the
  // namespaced "imported:conversation" form.
  assert.equal(draft.tags.includes('imported'), false);
});

await check('falls back to "Pasted conversation" title when blank', () => {
  const draft = buildCaptureRootDraft({
    conversationId: 'conv-A',
    title: '   ',
    body: 'b',
    position: { x: 0, y: 0 },
  });
  assert.equal(draft.title, 'Pasted conversation');
});

await check(
  'records suggestedNodeId on frontmatter when supplied',
  () => {
    const draft = buildCaptureRootDraft({
      conversationId: 'conv-A',
      title: 'X',
      body: 'b',
      position: { x: 0, y: 0 },
      suggestedNodeId: 'sug-1',
      suggestedConfidence: 0.85,
    });
    assert.deepEqual(draft.frontmatter, {
      relatedSuggestion: { nodeId: 'sug-1', confidence: 0.85 },
    });
  },
);

await check('omits frontmatter when no suggestion', () => {
  const draft = buildCaptureRootDraft({
    conversationId: 'conv-A',
    title: 'X',
    body: 'b',
    position: { x: 0, y: 0 },
  });
  assert.equal(draft.frontmatter, undefined);
});

// Sanity: a draft built by buildCaptureRootDraft, once materialised by
// addNode, is a valid theme-root candidate for the next router pass.
await check(
  'a materialised draft is recognised by isThemeRoot',
  () => {
    const draft = buildCaptureRootDraft({
      conversationId: 'conv-A',
      title: 'X',
      body: 'b',
      position: { x: 0, y: 0 },
    });
    const materialised = makeNode({
      ...draft,
      // the test stub treats CanvasNode as fully-formed
    } as Partial<CanvasNode>);
    assert.equal(isThemeRoot(materialised), true);
  },
);

// =====================================================================
// planCaptureRouting — three branches
// =====================================================================

section('planCaptureRouting — attach branch');

await check(
  'attach decision uses the existing node as the root and emits a toast',
  () => {
    const existing = makeNode({
      id: 'existing-root',
      title: 'Existing X topic',
      position: { x: 500, y: 600 },
    });
    const decision: RouteDecision = {
      kind: 'attach',
      nodeId: 'existing-root',
      confidence: 0.95,
      reason: 'high-confidence-parent-match',
    };
    const plan = planCaptureRouting({
      decision,
      nodes: [existing],
      fallbackPosition: { x: 0, y: 0 },
      conversationId: 'conv-import',
      titleDraft: 'X topic',
      bodyMarkdown: '# X topic\n\nbody',
    });
    assert.equal(plan.kind, 'attach-existing');
    if (plan.kind === 'attach-existing') {
      assert.equal(plan.rootNodeId, 'existing-root');
      assert.deepEqual(plan.rootPosition, { x: 500, y: 600 });
      assert.match(plan.toast, /Linked to existing topic.*Existing X topic/);
      assert.equal(plan.reason, 'high-confidence-parent-match');
    }
  },
);

await check(
  'same-conversation attach is silent (toast falsy)',
  () => {
    const existing = makeNode({ id: 'r1', title: 'Self topic' });
    const decision: RouteDecision = {
      kind: 'attach',
      nodeId: 'r1',
      confidence: 0.86,
      reason: 'same-conversation-parent-match',
    };
    const plan = planCaptureRouting({
      decision,
      nodes: [existing],
      fallbackPosition: { x: 0, y: 0 },
      conversationId: 'conv-A',
      titleDraft: 'X',
      bodyMarkdown: 'b',
    });
    assert.equal(plan.kind, 'attach-existing');
    if (plan.kind === 'attach-existing') {
      assert.equal(plan.toast, '');
      assert.equal(plan.reason, 'same-conversation-parent-match');
    }
  },
);

await check(
  'attach decision falls through to create-new-root if existing node is missing',
  () => {
    // Defensive: the router pointed at a node that is no longer in the
    // store. Plan must not crash; it should fall back to a fresh root.
    const decision: RouteDecision = {
      kind: 'attach',
      nodeId: 'gone',
      confidence: 0.95,
      reason: 'high-confidence-parent-match',
    };
    const plan = planCaptureRouting({
      decision,
      nodes: [],
      fallbackPosition: { x: 9, y: 9 },
      conversationId: 'conv-A',
      titleDraft: 'X',
      bodyMarkdown: 'b',
    });
    assert.equal(plan.kind, 'create-new-root');
  },
);

section('planCaptureRouting — suggest branch');

await check(
  'suggest decision creates a new root and does NOT attach',
  () => {
    const candidate = makeNode({
      id: 'sug-1',
      title: 'Suggested topic',
    });
    const decision: RouteDecision = {
      kind: 'suggest',
      nodeId: 'sug-1',
      confidence: 0.85,
      reason: 'possible-parent-match',
    };
    const plan = planCaptureRouting({
      decision,
      nodes: [candidate],
      fallbackPosition: { x: 1, y: 2 },
      conversationId: 'conv-A',
      titleDraft: 'New topic',
      bodyMarkdown: 'b',
    });
    assert.equal(plan.kind, 'create-new-root');
    if (plan.kind === 'create-new-root') {
      assert.equal(plan.rootDraft.kind, 'markdown');
      assert.ok(plan.rootDraft.tags.includes('themeKind:theme'));
      assert.equal(plan.suggestedNodeId, 'sug-1');
      assert.match(plan.toast ?? '', /Similar topic found.*Suggested topic/);
      // Suggested-related pointer is recorded on frontmatter.
      assert.deepEqual(plan.rootDraft.frontmatter, {
        relatedSuggestion: { nodeId: 'sug-1', confidence: 0.85 },
      });
    }
  },
);

await check(
  'cross-project suggest also creates a new root, never attaches',
  () => {
    const candidate = makeNode({ id: 'cross', title: 'Cross-project topic' });
    const decision: RouteDecision = {
      kind: 'suggest',
      nodeId: 'cross',
      confidence: 0.93,
      reason: 'cross-project-match',
    };
    const plan = planCaptureRouting({
      decision,
      nodes: [candidate],
      fallbackPosition: { x: 0, y: 0 },
      conversationId: 'conv-A',
      titleDraft: 'X',
      bodyMarkdown: 'b',
    });
    assert.equal(plan.kind, 'create-new-root');
    if (plan.kind === 'create-new-root') {
      assert.equal(plan.suggestedNodeId, 'cross');
    }
  },
);

section('planCaptureRouting — new-root branch');

await check(
  'new-root decision creates a theme-kind root with no suggestion',
  () => {
    const decision: RouteDecision = {
      kind: 'new-root',
      reason: 'no-candidates',
    };
    const plan = planCaptureRouting({
      decision,
      nodes: [],
      fallbackPosition: { x: 7, y: 8 },
      conversationId: 'conv-A',
      titleDraft: 'Solo topic',
      bodyMarkdown: '# Solo topic\n\nbody',
    });
    assert.equal(plan.kind, 'create-new-root');
    if (plan.kind === 'create-new-root') {
      assert.equal(plan.rootDraft.kind, 'markdown');
      assert.equal(plan.rootDraft.title, 'Solo topic');
      assert.deepEqual(plan.rootPosition, { x: 7, y: 8 });
      assert.equal(plan.suggestedNodeId, undefined);
      assert.equal(plan.toast, undefined);
      assert.equal(plan.rootDraft.frontmatter, undefined);
    }
  },
);

// =====================================================================
// Cross-cutting: every capture-root branch is kind:'markdown'
// =====================================================================

section('Capture roots are always kind:markdown');

await check('every plan branch produces markdown-kind root drafts', () => {
  // Iterate the three decision shapes through the planner. The
  // semantic role lives on `themeKind:theme` tag; the renderer kind
  // is uniformly `markdown` so imported content reads as MarkdownNode.
  const decisions: RouteDecision[] = [
    { kind: 'new-root', reason: 'no-candidates' },
    {
      kind: 'suggest',
      nodeId: 'sug',
      confidence: 0.85,
      reason: 'possible-parent-match',
    },
    {
      kind: 'attach',
      nodeId: 'gone',
      confidence: 0.95,
      reason: 'high-confidence-parent-match',
    },
  ];
  for (const decision of decisions) {
    const plan = planCaptureRouting({
      decision,
      nodes: [], // attach falls through to create-new-root because the
      // attach target is missing — same code path; still must be theme.
      fallbackPosition: { x: 0, y: 0 },
      conversationId: 'conv-A',
      titleDraft: 'X',
      bodyMarkdown: 'b',
    });
    if (plan.kind === 'create-new-root') {
      assert.equal(plan.rootDraft.kind, 'markdown');
    }
  }
});

console.log(`\n✓ ${passed} capture-routing checks passed.\n`);
