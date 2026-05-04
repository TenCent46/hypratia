/**
 * Acceptance tests for the chat-ingest similarity router (plan/v1/31, Step 1).
 *
 * Run with `pnpm check:ingest-routing`. Pure-function tests against
 * `src/services/ingestRouting/IngestRouter.ts` — no React, no Tauri.
 */

import assert from 'node:assert/strict';
import {
  chooseBestParentCandidate,
  extractCandidateText,
  getNodeProjectId,
  isThemeRoot,
  routeChild,
  routeParent,
  sharedTokenCount,
  tokenizeNonStopwords,
  tokenOverlapScore,
  type ScoredCandidate,
} from '../src/services/ingestRouting/IngestRouter.ts';
import {
  HEURISTIC_TOKEN_OVERLAP_MIN,
  PARENT_AUTO_ATTACH_THRESHOLD,
  PARENT_SUGGEST_THRESHOLD,
  SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW,
} from '../src/services/ingestRouting/thresholds.ts';
import type { CanvasNode, Conversation } from '../src/types/index.ts';

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
    kind: over.kind ?? 'theme',
    title: over.title ?? 'Note',
    contentMarkdown: over.contentMarkdown ?? '',
    position: over.position ?? { x: 0, y: 0 },
    tags: over.tags ?? ['themeKind:theme'],
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

function scored(over: Partial<ScoredCandidate>): ScoredCandidate {
  return {
    nodeId: over.nodeId ?? 'n1',
    score: over.score ?? 0,
    sameProject: over.sameProject ?? true,
    sameConversation: over.sameConversation ?? false,
    shareNonStopwordToken: over.shareNonStopwordToken ?? true,
    ...over,
  };
}

// =====================================================================
// Pure helpers
// =====================================================================

section('isThemeRoot — semantic predicate (kind-independent)');

// Plan/v1/31 corrective design: the predicate is semantic-only.
// `themeKind:theme` is the routing signal; visual `kind` (markdown vs
// theme) is independent.

await check('accepts kind:theme + themeKind:theme tag (live-chat root)', () => {
  const node = makeNode({ kind: 'theme', tags: ['themeKind:theme'] });
  assert.equal(isThemeRoot(node), true);
});

await check(
  'accepts kind:markdown + themeKind:theme tag (imported root)',
  () => {
    // The corrective design: imported chat roots render as MarkdownNode
    // but still need to be routable parents. Tag is the source of truth.
    const node = makeNode({
      kind: 'markdown',
      tags: ['themeKind:theme', 'imported:conversation'],
    });
    assert.equal(isThemeRoot(node), true);
  },
);

await check('rejects kind:theme without themeKind:theme tag', () => {
  const node = makeNode({ kind: 'theme', tags: ['themeKind:ask'] });
  assert.equal(isThemeRoot(node), false);
});

await check('rejects sub-classified theme nodes (themeKind:insight)', () => {
  const node = makeNode({
    kind: 'theme',
    tags: ['themeKind:insight'],
  });
  assert.equal(isThemeRoot(node), false);
});

await check(
  'rejects kind:markdown sub-leaves (themeKind:ask, no theme tag)',
  () => {
    // An ask child of an imported root must not be promoted to a parent
    // candidate just because it's also `kind:'markdown'`.
    const node = makeNode({
      kind: 'markdown',
      tags: ['themeKind:ask', 'imported:conversation'],
    });
    assert.equal(isThemeRoot(node), false);
  },
);

await check('rejects plain kind:markdown without any themeKind tag', () => {
  // Ordinary user-pasted markdown notes (no semantic role) must NOT
  // accidentally become parent candidates.
  const node = makeNode({
    kind: 'markdown',
    tags: ['hypratia', 'imported'],
  });
  assert.equal(isThemeRoot(node), false);
});

await check('rejects nodes with empty tag list', () => {
  const node = makeNode({ kind: 'theme', tags: [] });
  assert.equal(isThemeRoot(node), false);
});

section('getNodeProjectId');

await check('returns the projectId of the node\'s conversation', () => {
  const node = makeNode({ conversationId: 'conv-A' });
  const conversations = [
    makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
  ];
  assert.equal(getNodeProjectId(node, conversations), 'proj-1');
});

await check('returns null for unprojected conversations', () => {
  const node = makeNode({ conversationId: 'conv-A' });
  const conversations = [makeConversation({ id: 'conv-A' })];
  assert.equal(getNodeProjectId(node, conversations), null);
});

await check('returns null when conversation is missing', () => {
  const node = makeNode({ conversationId: 'conv-Z' });
  assert.equal(getNodeProjectId(node, []), null);
});

section('extractCandidateText');

await check('joins title and contentMarkdown', () => {
  const node = makeNode({ title: 'Hello', contentMarkdown: 'World' });
  assert.equal(extractCandidateText(node), 'Hello World');
});

await check('handles empty title gracefully', () => {
  const node = makeNode({ title: '', contentMarkdown: 'body' });
  assert.equal(extractCandidateText(node), 'body');
});

section('tokenizeNonStopwords');

await check('lowercases and drops short tokens + stopwords', () => {
  const tokens = tokenizeNonStopwords('The Quick Brown Fox.');
  assert.deepEqual(tokens, ['quick', 'brown', 'fox']);
});

await check('keeps Japanese tokens separated by punctuation', () => {
  const tokens = tokenizeNonStopwords('機械学習。データ可視化');
  assert.ok(tokens.includes('機械学習'));
  assert.ok(tokens.includes('データ可視化'));
});

section('tokenOverlapScore + sharedTokenCount');

await check('identical strings → score 1.0', () => {
  assert.equal(tokenOverlapScore('hello world', 'hello world'), 1);
});

await check('disjoint strings → score 0', () => {
  assert.equal(tokenOverlapScore('alpha beta', 'gamma delta'), 0);
});

await check('counts shared non-stopword tokens', () => {
  assert.equal(
    sharedTokenCount(
      'machine learning embeddings tutorial',
      'tutorial about machine learning',
    ),
    3, // machine, learning, tutorial (about/about-style stopwords are filtered)
  );
});

// =====================================================================
// Decision logic — chooseBestParentCandidate
// =====================================================================

section('chooseBestParentCandidate — same project');

await check('score >= 0.90 same-project → attach (high-confidence)', () => {
  const decision = chooseBestParentCandidate([
    scored({ nodeId: 'a', score: 0.95, sameProject: true }),
  ]);
  assert.equal(decision.kind, 'attach');
  if (decision.kind === 'attach') {
    assert.equal(decision.nodeId, 'a');
    assert.equal(decision.reason, 'high-confidence-parent-match');
    assert.equal(decision.confidence, 0.95);
  }
});

await check(
  'PARENT_AUTO_ATTACH_THRESHOLD is the lower bound for attach',
  () => {
    const decision = chooseBestParentCandidate([
      scored({ score: PARENT_AUTO_ATTACH_THRESHOLD, sameProject: true }),
    ]);
    assert.equal(decision.kind, 'attach');
  },
);

await check('0.82 <= score < 0.90 same-project → suggest', () => {
  const decision = chooseBestParentCandidate([
    scored({ nodeId: 'b', score: 0.85, sameProject: true }),
  ]);
  assert.equal(decision.kind, 'suggest');
  if (decision.kind === 'suggest') {
    assert.equal(decision.nodeId, 'b');
    assert.equal(decision.reason, 'possible-parent-match');
  }
});

await check('PARENT_SUGGEST_THRESHOLD is the lower bound for suggest', () => {
  const decision = chooseBestParentCandidate([
    scored({ score: PARENT_SUGGEST_THRESHOLD, sameProject: true }),
  ]);
  assert.equal(decision.kind, 'suggest');
});

await check('score < 0.82 same-project → new-root', () => {
  const decision = chooseBestParentCandidate([
    scored({ score: 0.7, sameProject: true }),
  ]);
  assert.equal(decision.kind, 'new-root');
  if (decision.kind === 'new-root') {
    assert.equal(decision.reason, 'no-safe-match');
  }
});

section('chooseBestParentCandidate — cross-project');

await check('score 0.95 cross-project → suggest (never attach)', () => {
  const decision = chooseBestParentCandidate([
    scored({ nodeId: 'x', score: 0.95, sameProject: false }),
  ]);
  assert.equal(decision.kind, 'suggest');
  if (decision.kind === 'suggest') {
    assert.equal(decision.reason, 'cross-project-match');
  }
});

await check('score 0.85 cross-project → suggest (cross-project-match)', () => {
  const decision = chooseBestParentCandidate([
    scored({ nodeId: 'x', score: 0.85, sameProject: false }),
  ]);
  assert.equal(decision.kind, 'suggest');
  if (decision.kind === 'suggest') {
    assert.equal(decision.reason, 'cross-project-match');
  }
});

await check('score 0.7 cross-project → new-root', () => {
  const decision = chooseBestParentCandidate([
    scored({ score: 0.7, sameProject: false }),
  ]);
  assert.equal(decision.kind, 'new-root');
});

section('chooseBestParentCandidate — same-conversation special case');

await check(
  'score 0.85 same-conversation → silent attach (same-conversation)',
  () => {
    const decision = chooseBestParentCandidate([
      scored({
        nodeId: 'sc',
        score: 0.85,
        sameProject: true,
        sameConversation: true,
      }),
    ]);
    assert.equal(decision.kind, 'attach');
    if (decision.kind === 'attach') {
      assert.equal(decision.reason, 'same-conversation-parent-match');
    }
  },
);

await check(
  'score 0.95 same-conversation → still attach (high-confidence wins reason)',
  () => {
    // Same-conversation rule lifts the suggest band into attach. At the
    // high band we keep the more specific same-conversation reason
    // because the user is plainly continuing the same chat.
    const decision = chooseBestParentCandidate([
      scored({
        nodeId: 'sc',
        score: 0.95,
        sameProject: true,
        sameConversation: true,
      }),
    ]);
    assert.equal(decision.kind, 'attach');
  },
);

section('chooseBestParentCandidate — safety net');

await check(
  'score < 0.95 with no shared non-stopword token → new-root (no-safe-match)',
  () => {
    const decision = chooseBestParentCandidate([
      scored({
        score: SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW - 0.01,
        sameProject: true,
        shareNonStopwordToken: false,
      }),
    ]);
    assert.equal(decision.kind, 'new-root');
    if (decision.kind === 'new-root') {
      assert.equal(decision.reason, 'no-safe-match');
    }
  },
);

await check(
  'score >= 0.95 still allows attach even with no shared token',
  () => {
    const decision = chooseBestParentCandidate([
      scored({
        score: 0.97,
        sameProject: true,
        shareNonStopwordToken: false,
      }),
    ]);
    assert.equal(decision.kind, 'attach');
  },
);

section('chooseBestParentCandidate — edge cases');

await check('empty candidates → new-root no-candidates', () => {
  const decision = chooseBestParentCandidate([]);
  assert.equal(decision.kind, 'new-root');
  if (decision.kind === 'new-root') {
    assert.equal(decision.reason, 'no-candidates');
  }
});

await check('higher score wins on tie-break', () => {
  const decision = chooseBestParentCandidate([
    scored({ nodeId: 'lower', score: 0.91, sameProject: true }),
    scored({ nodeId: 'higher', score: 0.96, sameProject: true }),
  ]);
  assert.equal(decision.kind, 'attach');
  if (decision.kind === 'attach') assert.equal(decision.nodeId, 'higher');
});

await check(
  'on score tie, sameProject candidate wins over cross-project',
  () => {
    const decision = chooseBestParentCandidate([
      scored({ nodeId: 'cross', score: 0.92, sameProject: false }),
      scored({ nodeId: 'in-proj', score: 0.92, sameProject: true }),
    ]);
    assert.equal(decision.kind, 'attach');
    if (decision.kind === 'attach') assert.equal(decision.nodeId, 'in-proj');
  },
);

// =====================================================================
// routeParent — end-to-end with fixture nodes
// =====================================================================

section('routeParent');

await check('no theme roots in store → new-root no-candidates', async () => {
  const decision = await routeParent({
    firstTurn: 'How do embeddings work',
    conversationId: 'conv-A',
    projectId: 'proj-1',
    nodes: [
      makeNode({
        id: 'm1',
        kind: 'markdown',
        tags: ['imported'],
      }),
    ],
    conversations: [
      makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
    ],
    activeProjectId: 'proj-1',
  });
  assert.equal(decision.kind, 'new-root');
  if (decision.kind === 'new-root') {
    assert.equal(decision.reason, 'no-candidates');
  }
});

await check('empty firstTurn → new-root no-candidates', async () => {
  const decision = await routeParent({
    firstTurn: '   ',
    conversationId: 'conv-A',
    projectId: 'proj-1',
    nodes: [
      makeNode({
        id: 't1',
        title: 'Embeddings',
        kind: 'theme',
        tags: ['themeKind:theme'],
      }),
    ],
    conversations: [makeConversation({ id: 'conv-A', projectId: 'proj-1' })],
    activeProjectId: 'proj-1',
  });
  assert.equal(decision.kind, 'new-root');
});

await check(
  'matching same-project theme root with shared content → suggest or attach',
  async () => {
    // Token overlap between near-identical strings can clear the
    // suggest threshold. Pure-heuristic mode also requires the
    // HEURISTIC_TOKEN_OVERLAP_MIN floor, so we use a query and
    // candidate that share several distinctive tokens.
    const decision = await routeParent({
      firstTurn:
        'Designing embeddings for semantic search across markdown notes',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      nodes: [
        makeNode({
          id: 't1',
          conversationId: 'conv-other',
          kind: 'theme',
          tags: ['themeKind:theme', 'imported:conversation'],
          title: 'Embeddings for semantic search',
          contentMarkdown:
            'Designing embeddings for semantic search across markdown notes',
        }),
      ],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
        makeConversation({ id: 'conv-other', projectId: 'proj-1' }),
      ],
      activeProjectId: 'proj-1',
    });
    // Heuristic Jaccard between identical strings is 1.0 → attach band.
    assert.equal(decision.kind, 'attach');
  },
);

await check(
  'cross-project candidate is demoted to suggest, never attach',
  async () => {
    const decision = await routeParent({
      firstTurn:
        'Designing embeddings for semantic search across markdown notes',
      conversationId: 'conv-A',
      projectId: 'proj-import',
      nodes: [
        makeNode({
          id: 't1',
          conversationId: 'conv-other',
          kind: 'theme',
          tags: ['themeKind:theme'],
          title: 'Embeddings for semantic search',
          contentMarkdown:
            'Designing embeddings for semantic search across markdown notes',
        }),
      ],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-import' }),
        makeConversation({ id: 'conv-other', projectId: 'proj-other' }),
      ],
      activeProjectId: 'proj-import',
    });
    assert.equal(decision.kind, 'suggest');
    if (decision.kind === 'suggest') {
      assert.equal(decision.reason, 'cross-project-match');
    }
  },
);

await check(
  'pure-heuristic conservatism: high Jaccard but few shared tokens → new-root',
  async () => {
    // 2 tokens on each side, 1 shared. Jaccard = 1/3 ≈ 0.33 — below
    // PARENT_SUGGEST_THRESHOLD anyway, so the conservative guard
    // doesn't kick in here. We test the guard's effect using crafted
    // small queries instead.
    const decision = await routeParent({
      firstTurn: 'embeddings tutorial',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      nodes: [
        makeNode({
          id: 't1',
          conversationId: 'conv-A',
          kind: 'theme',
          tags: ['themeKind:theme'],
          title: 'embeddings overview',
        }),
      ],
      conversations: [makeConversation({ id: 'conv-A', projectId: 'proj-1' })],
      activeProjectId: 'proj-1',
    });
    // 1 shared token / 3 union → Jaccard ≈ 0.33 — below PARENT_SUGGEST_THRESHOLD.
    assert.equal(decision.kind, 'new-root');
  },
);

await check(
  'pure-heuristic guard demotes high-overlap-but-few-tokens to new-root',
  async () => {
    // Construct a case where Jaccard >= PARENT_SUGGEST_THRESHOLD but
    // shared token count is below HEURISTIC_TOKEN_OVERLAP_MIN.
    // Both sides have 2 tokens that fully overlap → Jaccard = 1.0,
    // shared = 2 < 3 (HEURISTIC_TOKEN_OVERLAP_MIN).
    const decision = await routeParent({
      firstTurn: 'embeddings tutorial',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      nodes: [
        makeNode({
          id: 't1',
          conversationId: 'conv-A',
          kind: 'theme',
          tags: ['themeKind:theme'],
          title: 'embeddings tutorial',
        }),
      ],
      conversations: [makeConversation({ id: 'conv-A', projectId: 'proj-1' })],
      activeProjectId: 'proj-1',
    });
    assert.equal(decision.kind, 'new-root');
    if (decision.kind === 'new-root') {
      assert.equal(decision.reason, 'no-safe-match');
    }
    // Sanity: the floor really is HEURISTIC_TOKEN_OVERLAP_MIN.
    assert.ok(HEURISTIC_TOKEN_OVERLAP_MIN >= 3);
  },
);

// =====================================================================
// routeChild — Step 1 stub (always parent fallback)
// =====================================================================

section('routeChild');

await check(
  'Step 1 stub: always returns attach to parentRootId with confidence 0',
  async () => {
    const decision = await routeChild({
      turn: 'Follow-up question',
      parentRootId: 'parent-1',
      importedSoFar: [],
      nodes: [],
    });
    assert.equal(decision.kind, 'attach');
    if (decision.kind === 'attach') {
      assert.equal(decision.nodeId, 'parent-1');
      assert.equal(decision.confidence, 0);
      assert.equal(decision.reason, 'sibling-match');
    }
  },
);

console.log(`\n✓ ${passed} ingest-routing checks passed.\n`);
