/**
 * Acceptance tests for plan/v1/31 Step 5 — embedding seam +
 * IngestRouter cosine integration. Pure-function tests — no Tauri,
 * no React, no store.
 *
 * Run with `pnpm check:embeddings`.
 */

import assert from 'node:assert/strict';
import {
  cosineSimilarity,
  cosineToScore,
  getEmbeddingProvider,
  resetEmbeddingProviderCache,
} from '../src/services/embeddings/index.ts';
import { MockEmbeddingProvider } from '../src/services/embeddings/MockEmbeddingProvider.ts';
import {
  routeParent,
  type EmbeddingScoringAdapter,
} from '../src/services/ingestRouting/IngestRouter.ts';
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
    title: over.title ?? 'Existing topic',
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

// =====================================================================
// cosineSimilarity / cosineToScore
// =====================================================================

section('cosineSimilarity');

await check('identical unit vectors → 1', () => {
  const v = [1, 0, 0];
  assert.equal(cosineSimilarity(v, v), 1);
});

await check('orthogonal vectors → 0', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

await check('opposite vectors → -1', () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

await check('mismatched lengths → 0 (no crash)', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0]), 0);
});

await check('empty vectors → 0', () => {
  assert.equal(cosineSimilarity([], []), 0);
});

await check('zero vectors → 0', () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 0, 0]), 0);
});

section('cosineToScore');

await check('positive cosine passes through', () => {
  assert.equal(cosineToScore(0.7), 0.7);
});

await check('negative cosine clamps to 0', () => {
  assert.equal(cosineToScore(-0.5), 0);
});

await check('NaN clamps to 0', () => {
  assert.equal(cosineToScore(Number.NaN), 0);
});

await check('cosine > 1 clamps to 1', () => {
  assert.equal(cosineToScore(1.5), 1);
});

// =====================================================================
// getEmbeddingProvider
// =====================================================================

section('getEmbeddingProvider');

await check("'off' returns null", () => {
  resetEmbeddingProviderCache();
  assert.equal(getEmbeddingProvider('off'), null);
});

await check("'mock' returns a MockEmbeddingProvider", () => {
  resetEmbeddingProviderCache();
  const p = getEmbeddingProvider('mock');
  assert.ok(p);
  assert.equal(p!.name(), 'mock');
});

await check('repeat call to mock returns the cached instance', () => {
  resetEmbeddingProviderCache();
  const a = getEmbeddingProvider('mock');
  const b = getEmbeddingProvider('mock');
  assert.equal(a, b);
});

// =====================================================================
// MockEmbeddingProvider — deterministic + normalized
// =====================================================================

section('MockEmbeddingProvider');

await check('embed() returns the configured dim', async () => {
  const p = new MockEmbeddingProvider();
  const v = await p.embed('hello world');
  assert.equal(v.length, p.dim());
});

await check('same input → same output (deterministic)', async () => {
  const p = new MockEmbeddingProvider();
  const a = await p.embed('hello world');
  const b = await p.embed('hello world');
  assert.deepEqual(a, b);
});

await check('different inputs → different vectors', async () => {
  const p = new MockEmbeddingProvider();
  const a = await p.embed('hello world');
  const b = await p.embed('completely different topic');
  assert.notDeepEqual(a, b);
});

await check('output is unit-normalised (||v|| ≈ 1)', async () => {
  const p = new MockEmbeddingProvider();
  const v = await p.embed('any text');
  let n = 0;
  for (const x of v) n += x * x;
  assert.ok(Math.abs(Math.sqrt(n) - 1) < 1e-6);
});

// =====================================================================
// IngestRouter integration with embedding adapter
// =====================================================================

section('routeParent — embedding adapter');

await check(
  'cosine ≥ 0.90 same-project → attach via embedding adapter',
  async () => {
    // Synthetic adapter: return a fixed 3-d unit vector for the query
    // and a near-identical vector for the candidate. Cosine ≈ 1.
    const queryVec = [1, 0, 0];
    const candidateVec = [0.999, 0.0447, 0]; // ≈cos(2.5°)
    const node = makeNode({
      id: 'c1',
      embedding: candidateVec,
    });
    const adapter: EmbeddingScoringAdapter = {
      embed: async () => queryVec,
      resolveCandidate: async () => candidateVec,
    };
    const decision = await routeParent({
      firstTurn: 'anything — title overlap not consulted on embedding path',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      activeProjectId: 'proj-1',
      nodes: [node],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
      ],
      embeddings: adapter,
    });
    assert.equal(decision.kind, 'attach');
  },
);

await check(
  'cosine in suggest band → suggest via embedding adapter',
  async () => {
    // ≈cos(28°) ≈ 0.88 — between 0.82 and 0.90.
    const queryVec = [1, 0, 0];
    const candidateVec = [Math.cos((28 * Math.PI) / 180), Math.sin((28 * Math.PI) / 180), 0];
    // Title shares "embeddings" with the query so the safety net
    // (SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW = 0.95 + zero-token-overlap
    // demote-to-new-root rule) doesn't fire below the suggest band.
    // Candidate must be in a DIFFERENT conversation so the
    // same-conversation rule doesn't lift the suggest band into attach.
    const node = makeNode({
      id: 'c1',
      conversationId: 'conv-other',
      title: 'Embeddings overview',
    });
    const adapter: EmbeddingScoringAdapter = {
      embed: async () => queryVec,
      resolveCandidate: async () => candidateVec,
    };
    const decision = await routeParent({
      firstTurn: 'embeddings deep dive',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      activeProjectId: 'proj-1',
      nodes: [node],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
        makeConversation({ id: 'conv-other', projectId: 'proj-1' }),
      ],
      embeddings: adapter,
    });
    assert.equal(decision.kind, 'suggest');
  },
);

await check(
  'low cosine → new-root via embedding adapter',
  async () => {
    const queryVec = [1, 0, 0];
    const candidateVec = [0, 1, 0]; // orthogonal → cosine 0
    const node = makeNode({ id: 'c1' });
    const adapter: EmbeddingScoringAdapter = {
      embed: async () => queryVec,
      resolveCandidate: async () => candidateVec,
    };
    const decision = await routeParent({
      firstTurn: 'something',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      activeProjectId: 'proj-1',
      nodes: [node],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
      ],
      embeddings: adapter,
    });
    assert.equal(decision.kind, 'new-root');
  },
);

await check(
  'embedding-path skips the heuristic-overlap floor',
  async () => {
    // Same fixture that the ingest-routing pure-heuristic test uses:
    // 2 shared tokens, Jaccard 1.0, normally demoted by the floor.
    // With an embedding signal of 1.0, the router should attach.
    const queryVec = [1, 0, 0];
    const candidateVec = [1, 0, 0];
    const node = makeNode({
      id: 'c1',
      title: 'embeddings tutorial',
      contentMarkdown: '',
    });
    const adapter: EmbeddingScoringAdapter = {
      embed: async () => queryVec,
      resolveCandidate: async () => candidateVec,
    };
    const decision = await routeParent({
      firstTurn: 'embeddings tutorial', // 2 tokens
      conversationId: 'conv-A',
      projectId: 'proj-1',
      activeProjectId: 'proj-1',
      nodes: [node],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-1' }),
      ],
      embeddings: adapter,
    });
    assert.equal(decision.kind, 'attach');
  },
);

await check(
  'cross-project embedding match downgrades to suggest',
  async () => {
    const queryVec = [1, 0, 0];
    const candidateVec = [1, 0, 0];
    const node = makeNode({ id: 'c1', conversationId: 'conv-other' });
    const adapter: EmbeddingScoringAdapter = {
      embed: async () => queryVec,
      resolveCandidate: async () => candidateVec,
    };
    const decision = await routeParent({
      firstTurn: 'any',
      conversationId: 'conv-A',
      projectId: 'proj-import',
      activeProjectId: 'proj-import',
      nodes: [node],
      conversations: [
        makeConversation({ id: 'conv-A', projectId: 'proj-import' }),
        makeConversation({ id: 'conv-other', projectId: 'proj-other' }),
      ],
      embeddings: adapter,
    });
    assert.equal(decision.kind, 'suggest');
  },
);

await check(
  'resolveCandidate returning null → score 0 → new-root',
  async () => {
    const node = makeNode({ id: 'c1' });
    const adapter: EmbeddingScoringAdapter = {
      embed: async () => [1, 0, 0],
      resolveCandidate: async () => null, // candidate has no embedding and can't be computed
    };
    const decision = await routeParent({
      firstTurn: 'abc',
      conversationId: 'conv-A',
      projectId: 'proj-1',
      activeProjectId: 'proj-1',
      nodes: [node],
      conversations: [makeConversation({ id: 'conv-A', projectId: 'proj-1' })],
      embeddings: adapter,
    });
    assert.equal(decision.kind, 'new-root');
  },
);

console.log(`\n✓ ${passed} embeddings checks passed.\n`);
