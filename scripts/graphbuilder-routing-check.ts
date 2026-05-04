/**
 * Acceptance tests for plan/v1/31 Steps 3 + 4. Pure-function tests
 * against `src/services/graphBuilder/conversationAssembly.ts` — no
 * React, no Tauri, no store. We exercise the assembly logic directly
 * (parseTurns + pairTurns + classifyChunkHeuristic + assembleStagedGraph)
 * so the test runner doesn't drag in the LLM SDK / Tauri secrets path
 * that `conversation.ts` transitively imports.
 */

import assert from 'node:assert/strict';
import {
  ASSISTANT_BODY_CAP,
  USER_BODY_CAP,
  assembleStagedGraph,
  classifyChunkHeuristic,
  pairTurns,
  parseTurns,
  type RootImportMeta,
} from '../src/services/graphBuilder/conversationAssembly.ts';
import type { ConversationClassification } from '../src/services/graphBuilder/types.ts';

let passed = 0;

function section(label: string) {
  console.log(`\n— ${label}`);
}

async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/**
 * Test helper that mimics `buildConversationGraph` in heuristic mode
 * without importing the modelChain runtime. parse → pair →
 * classifyHeuristic → mint missing theme ids → assembleStagedGraph.
 */
function buildHeuristic(
  text: string,
  opts?: { existingThemes?: Array<{ id: string; title: string }> },
) {
  const turns = parseTurns(text);
  const pairs = pairTurns(turns);
  const userTurns = pairs.map((p) => p.user);
  const themesAcc = new Map<string, { id: string; title: string }>();
  if (opts?.existingThemes) {
    for (const t of opts.existingThemes.slice(0, 16)) themesAcc.set(t.id, t);
  }
  const all: ConversationClassification[] = [];
  // Heuristic: feed all userTurns at once so the seeded prior root is
  // honored if present.
  const prior = Array.from(themesAcc.values());
  const value = classifyChunkHeuristic(
    userTurns,
    prior[prior.length - 1] ?? null,
  );
  for (const c of value) {
    if (c.isNew || !c.themeId || !themesAcc.has(c.themeId)) {
      const localId = `theme:${themesAcc.size}`;
      themesAcc.set(localId, { id: localId, title: c.themeTitle });
      c.themeId = localId;
    }
  }
  all.push(...value);
  return assembleStagedGraph(all, pairs, themesAcc);
}

// =====================================================================
// pairTurns
// =====================================================================

section('pairTurns');

await check('pairs each user turn with the following assistant turn', () => {
  const turns = parseTurns(
    [
      'User: question one',
      'Assistant: reply one',
      'User: question two',
      'Assistant: reply two',
    ].join('\n'),
  );
  const pairs = pairTurns(turns);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].user.content, 'question one');
  assert.equal(pairs[0].assistant?.content, 'reply one');
  assert.equal(pairs[1].user.content, 'question two');
  assert.equal(pairs[1].assistant?.content, 'reply two');
});

await check('user turn with no following reply gets null assistant', () => {
  const turns = parseTurns(['User: lone question'].join('\n'));
  const pairs = pairTurns(turns);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].assistant, null);
});

await check('skips orphan assistant turns', () => {
  const turns = parseTurns(
    ['Assistant: pre-amble', 'User: real question', 'Assistant: real reply'].join(
      '\n',
    ),
  );
  const pairs = pairTurns(turns);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].user.content, 'real question');
});

// =====================================================================
// buildConversationGraph — collapsed first turn + ask/insight pairs
// =====================================================================

section('buildConversationGraph — collapsed first turn');

const TWO_TURN_CHAT = [
  'User: How do embeddings work?',
  'Assistant: They map text into vectors that capture meaning.',
  'User: And how do you compare them?',
  'Assistant: Use cosine similarity.',
].join('\n');

await check(
  'first user turn is collapsed into the theme root (title + body)',
  async () => {
    const staged = buildHeuristic(TWO_TURN_CHAT);
    const roots = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:theme'),
    );
    assert.ok(roots.length >= 1);
    const root = roots[0];
    // Heuristic sets askSummary = trimmed user turn content. The root
    // title should reflect the first askSummary, not a generic "Theme".
    assert.match(root.title, /How do embeddings work/);
    // Root contentMarkdown should be the first assistant response.
    assert.match(
      root.contentMarkdown ?? '',
      /map text into vectors that capture meaning/,
    );
  },
);

await check(
  'first turn data is stashed on frontmatter.importMeta',
  async () => {
    const staged = buildHeuristic(TWO_TURN_CHAT);
    const root = staged.nodes.find((n) =>
      (n.tags ?? []).includes('themeKind:theme'),
    );
    assert.ok(root);
    const fm = root!.frontmatter as Record<string, unknown> | undefined;
    const meta = fm?.importMeta as RootImportMeta | undefined;
    assert.ok(meta, 'importMeta should be present');
    assert.match(meta!.firstAskBody, /How do embeddings work/);
    assert.match(meta!.firstReplyBody, /map text into vectors/);
  },
);

await check(
  'subsequent turns become ask + insight node pairs with the right edges',
  async () => {
    const staged = buildHeuristic(TWO_TURN_CHAT);
    const askNodes = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:ask'),
    );
    const insightNodes = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:insight'),
    );
    // Two user turns, first is collapsed → exactly one ask + one insight.
    assert.equal(askNodes.length, 1);
    assert.equal(insightNodes.length, 1);
    assert.match(askNodes[0].title, /how do you compare them/i);
    assert.match(askNodes[0].contentMarkdown ?? '', /how do you compare them/i);
    assert.match(insightNodes[0].contentMarkdown ?? '', /cosine similarity/i);

    // Edge structure: root --(parent)--> ask --(related, reply)--> insight.
    const rootIdx = staged.nodes.findIndex((n) =>
      (n.tags ?? []).includes('themeKind:theme'),
    );
    const askIdx = staged.nodes.findIndex((n) =>
      (n.tags ?? []).includes('themeKind:ask'),
    );
    const insightIdx = staged.nodes.findIndex((n) =>
      (n.tags ?? []).includes('themeKind:insight'),
    );
    const parentEdge = staged.edges.find(
      (e) => e.kind === 'parent' && e.targetIndex === askIdx,
    );
    assert.ok(parentEdge, 'expected parent edge from root to ask');
    assert.equal(parentEdge!.sourceIndex, rootIdx);

    const replyEdge = staged.edges.find(
      (e) =>
        e.kind === 'related' &&
        e.label === 'reply' &&
        e.sourceIndex === askIdx,
    );
    assert.ok(replyEdge, 'expected related/reply edge from ask to insight');
    assert.equal(replyEdge!.targetIndex, insightIdx);
  },
);

await check(
  'single-turn chat collapses entirely into the root, no pairs emitted',
  async () => {
    const staged = buildHeuristic(
      ['User: just one question', 'Assistant: just one reply'].join('\n'),
    );
    const askNodes = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:ask'),
    );
    const insightNodes = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:insight'),
    );
    assert.equal(askNodes.length, 0);
    assert.equal(insightNodes.length, 0);
  },
);

await check(
  'theme roots carry the canonical themeKind:theme + imported:conversation tags',
  async () => {
    const staged = buildHeuristic(TWO_TURN_CHAT);
    const root = staged.nodes.find((n) =>
      (n.tags ?? []).includes('themeKind:theme'),
    );
    assert.ok(root);
    assert.ok(root!.tags?.includes('themeKind:theme'));
    assert.ok(root!.tags?.includes('imported:conversation'));
    // Plan/v1/31 corrective design — imported roots render as
    // MarkdownNode (kind:'markdown'). The `themeKind:theme` tag carries
    // the semantic role for routing.
    assert.equal(root!.kind, 'markdown');
  },
);

await check(
  'ask + insight pair nodes are kind:markdown (not theme)',
  () => {
    // The corrective design extends to leaf nodes too — every imported
    // node renders as MarkdownNode. ThemeNode is reserved for live-chat
    // auto-summaries.
    const staged = buildHeuristic(TWO_TURN_CHAT);
    const askNodes = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:ask'),
    );
    const insightNodes = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:insight'),
    );
    assert.ok(askNodes.length >= 1);
    assert.ok(insightNodes.length >= 1);
    for (const n of [...askNodes, ...insightNodes]) {
      assert.equal(n.kind, 'markdown');
    }
  },
);

await check(
  'no chat input — assembly is empty (build flow returns fallback root upstream)',
  async () => {
    // With no role markers, parseTurns finds no turns, pairTurns is
    // empty, and assembleStagedGraph emits an empty graph. The
    // upstream `buildConversationGraph` injects a fallback root in
    // that case; that lives in `conversation.ts` (LLM-coupled) and
    // isn't exercised here.
    const staged = buildHeuristic('just some prose, no role markers');
    assert.equal(staged.nodes.length, 0);
    assert.equal(staged.edges.length, 0);
  },
);

// =====================================================================
// existingThemes seeding (Step 3B)
// =====================================================================

section('existingThemes priorThemes seeding');

await check(
  'existingThemes seed is honored by the heuristic classifier',
  () => {
    // classifyChunkHeuristic anchors on the priorRoot when one is
    // available, so the seed becomes the theme everything attaches to
    // — no duplicate fresh-mint.
    const staged = buildHeuristic(TWO_TURN_CHAT, {
      existingThemes: [
        { id: 'canvas-root-1', title: 'Embeddings overview' },
      ],
    });
    const roots = staged.nodes.filter((n) =>
      (n.tags ?? []).includes('themeKind:theme'),
    );
    assert.equal(roots.length, 1);
  },
);

await check('large seed (50 entries) does not crash the build', () => {
  const seed = Array.from({ length: 50 }, (_, i) => ({
    id: `t-${i}`,
    title: `Theme ${i}`,
  }));
  const staged = buildHeuristic(TWO_TURN_CHAT, { existingThemes: seed });
  assert.ok(staged.nodes.length > 0);
});

// =====================================================================
// Body caps (Step 4 — assistant body trimmed at ASSISTANT_BODY_CAP)
// =====================================================================

section('body caps');

await check('assistant body is trimmed at ASSISTANT_BODY_CAP', () => {
  const longReply = 'x'.repeat(ASSISTANT_BODY_CAP + 500);
  const staged = buildHeuristic(
    `User: question\nAssistant: ${longReply}`,
  );
  const root = staged.nodes.find((n) =>
    (n.tags ?? []).includes('themeKind:theme'),
  );
  assert.ok(root);
  assert.ok((root!.contentMarkdown ?? '').length <= ASSISTANT_BODY_CAP + 200);
  assert.match(root!.contentMarkdown ?? '', /truncated/);
});

await check('user body cap is exposed', () => {
  // Cap constant must be > 0 so the trim function actually trims;
  // sanity check on the contract.
  assert.ok(USER_BODY_CAP > 0);
});

console.log(`\n✓ ${passed} graphbuilder-routing checks passed.\n`);
