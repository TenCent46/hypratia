import { useStore } from '../../store';
import { showToast } from '../../components/Toast/Toast';
import { buildModelChain } from './modelChain';
import { routeInput } from './router';
import { buildConversationGraph } from './conversation';
import type { RootImportMeta } from './conversation';
import { buildProseGraph } from './prose';
import {
  layoutBatch,
  pickAnchorPosition,
  summarizeExistingPositions,
} from './layout';
import type {
  BuildSummary,
  ChainTier,
  GraphBuildOptions,
  GraphInputKind,
  StagedGraph,
  StagedNode,
} from './types';
import { routeParent } from '../ingestRouting/IngestRouter';
import type {
  EmbeddingScoringAdapter,
  RouteDecision,
} from '../ingestRouting/IngestRouter';
import { isThemeRoot } from '../ingestRouting/IngestRouter';
import { LLM_FALLBACK_TOPK } from '../ingestRouting/thresholds';
import { getEmbeddingProvider } from '../embeddings';
import type { CanvasNode } from '../../types';

export type {
  BuildSummary,
  ChainTier,
  GraphBuildOptions,
  GraphInputKind,
} from './types';
export { parseTurns } from './conversation';
export { routeHeuristically } from './router';

/**
 * Public entry point: turn a pasted text blob into nodes + edges on the
 * canvas. Routing and content extraction both walk the same model
 * chain so we don't accidentally pick a different model mid-run. The
 * heuristic tier guarantees a non-empty graph even when no model is
 * available.
 *
 * Plan/v1/31 Steps 3 + 4:
 *  - Theme roots are routed through `IngestRouter.routeParent` before
 *    commit so a build about an existing canvas topic attaches under
 *    the existing root instead of duplicating it.
 *  - The classifier is seeded with the active project's existing theme
 *    roots so the LLM-side dedup signal aligns with the router-side.
 *  - On `attach`, the staged root's collapsed first turn (stashed in
 *    `frontmatter.importMeta`) is re-expanded as a separate
 *    ask + insight pair under the existing root so the new chat's
 *    first-turn content isn't lost.
 */
export async function buildGraphFromText(
  text: string,
  opts: GraphBuildOptions,
): Promise<BuildSummary> {
  const started = performance.now();
  const settings = useStore.getState().settings;
  const chain: ChainTier[] =
    opts.chainOverride ?? (await buildModelChain(settings));

  if (opts.signal?.aborted) {
    throw new DOMException('aborted', 'AbortError');
  }

  const { kind, modelUsed: routerTier } = await routeInput(
    text,
    chain,
    opts.signal,
  );
  if (opts.signal?.aborted) {
    throw new DOMException('aborted', 'AbortError');
  }

  // Step 3B — feed the active project's existing theme roots to the
  // classifier so it can return one of those ids and the host's
  // routeParent pass picks them up via title/content match.
  const existingThemes =
    kind === 'conversation' ? collectExistingThemes(opts.conversationId) : [];

  const staged: StagedGraph =
    kind === 'conversation'
      ? await buildConversationGraph(text, chain, opts.signal, {
          existingThemes,
        })
      : await buildProseGraph(text, chain, opts.signal);

  // Position the staged nodes in a fresh region.
  const existing = summarizeExistingPositions(useStore.getState().nodes);
  const anchor = pickAnchorPosition(existing);
  layoutBatch(staged, kind, anchor);

  // Step 3A — route every staged theme root through IngestRouter.
  // `routedDecisions[i]` is the decision for `staged.nodes[i]`; non-theme
  // roots are absent.
  const routedDecisions = await routeStagedThemeRoots(staged, opts.conversationId);

  // Commit pass.
  //
  // When an attach decision sends children to an existing canvas root
  // that lives in a *different conversation* (allowed by routeParent
  // for same-project matches), the children must be added to the
  // existing root's conversationId — not the active import's. Reason:
  // CanvasPanel filters edges by `visibleNodeIds` per conversation, so
  // if the children sat in conversation A but their parent in B, every
  // edge would be silently filtered out at render time and the graph
  // would look disconnected. Carrying the existing root's
  // conversationId keeps the whole subtree visible together; the
  // existing-topic toast tells the user where the linked import landed.
  type AttachContext = {
    parentConversationId: string;
    parentRootId: string;
  };
  const attachByThemeIndex = new Map<number, AttachContext>();
  const themeIndexByStagedIdx = new Map<number, number>();
  for (const e of staged.edges) {
    if (e.kind !== 'parent') continue;
    themeIndexByStagedIdx.set(e.targetIndex, e.sourceIndex);
  }
  function resolveChildConversationId(stagedIdx: number): string {
    let cur = stagedIdx;
    const seen = new Set<number>();
    while (!seen.has(cur)) {
      seen.add(cur);
      const ctx = attachByThemeIndex.get(cur);
      if (ctx) return ctx.parentConversationId;
      const parent = themeIndexByStagedIdx.get(cur);
      if (parent === undefined) break;
      cur = parent;
    }
    return opts.conversationId;
  }

  const idByIndex: string[] = new Array(staged.nodes.length).fill('');
  for (let i = 0; i < staged.nodes.length; i += 1) {
    const n = staged.nodes[i];
    const decision = routedDecisions.get(i);
    if (decision?.kind === 'attach') {
      // Reuse the existing canvas root. addNode is skipped — the
      // existing node retains its own title/content/embedding.
      idByIndex[i] = decision.nodeId;
      const existingNode = useStore
        .getState()
        .nodes.find((node) => node.id === decision.nodeId);
      const titleForToast =
        existingNode?.title || 'existing topic';
      if (decision.reason !== 'same-conversation-parent-match') {
        showToast({
          message: `Linked to existing topic: "${titleForToast}"`,
          tone: 'success',
        });
      }
      const parentConversationId =
        existingNode?.conversationId ?? opts.conversationId;
      attachByThemeIndex.set(i, {
        parentConversationId,
        parentRootId: decision.nodeId,
      });
      // Re-expand the staged root's collapsed first turn as a real
      // ask + insight pair under the existing canvas root so no turn
      // content is destroyed by skipping addNode.
      reExpandFirstTurn(n, decision.nodeId, parentConversationId);
      continue;
    }
    const cleaned = stripImportMeta(n);
    const childConversationId = resolveChildConversationId(i);
    const created = useStore.getState().addNode({
      ...cleaned,
      conversationId: childConversationId,
      themeId: undefined, // patched below for theme roots
    });
    idByIndex[i] = created.id;
    if (decision?.kind === 'suggest') {
      // Record the suggested existing canvas root in frontmatter so a
      // future UI surface can offer to promote it to a real link. The
      // structural attach is intentionally NOT performed here.
      const prevFm =
        (created.frontmatter as Record<string, unknown> | undefined) ?? {};
      useStore.getState().updateNode(created.id, {
        frontmatter: {
          ...prevFm,
          relatedSuggestion: {
            nodeId: decision.nodeId,
            confidence: decision.confidence,
          },
        },
      });
    }
  }
  // Theme roots: set `themeId` to their own id so child clusters bind.
  staged.nodes.forEach((n, i) => {
    const tags = n.tags ?? [];
    if (!tags.includes('themeKind:theme')) return;
    const decision = routedDecisions.get(i);
    if (decision?.kind === 'attach') return; // existing root keeps its themeId
    useStore.getState().updateNode(idByIndex[i], { themeId: idByIndex[i] });
  });
  // Asks → carry the parent theme's id as `themeId` for clustering.
  for (const e of staged.edges) {
    if (e.kind !== 'parent') continue;
    useStore.getState().updateNode(idByIndex[e.targetIndex], {
      themeId: idByIndex[e.sourceIndex],
    });
  }

  for (const e of staged.edges) {
    useStore.getState().addEdge({
      sourceNodeId: idByIndex[e.sourceIndex],
      targetNodeId: idByIndex[e.targetIndex],
      ...(e.kind ? { kind: e.kind } : {}),
      ...(e.label ? { label: e.label } : {}),
    });
  }

  const modelUsed = routerTier;
  return {
    classifiedAs: kind as GraphInputKind,
    nodeCount: staged.nodes.length,
    edgeCount: staged.edges.length,
    modelUsed,
    durationMs: Math.round(performance.now() - started),
  };
}

/**
 * Snapshot the active project's theme roots, capped at the LLM
 * fallback top-k (most-recently-updated first). Pure read of the
 * store; the host re-snapshots later for routeParent so this list
 * being slightly stale is harmless.
 */
function collectExistingThemes(
  conversationId: string,
): Array<{ id: string; title: string }> {
  const state = useStore.getState();
  const conv = state.conversations.find((c) => c.id === conversationId);
  const projectId = conv?.projectId ?? null;
  const conversationsInProject = new Set(
    state.conversations
      .filter((c) =>
        projectId === null
          ? c.projectId === undefined || c.projectId === null
          : c.projectId === projectId,
      )
      .map((c) => c.id),
  );
  return state.nodes
    .filter(
      (n) => isThemeRoot(n) && conversationsInProject.has(n.conversationId),
    )
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, LLM_FALLBACK_TOPK)
    .map((n) => ({ id: n.id, title: n.title }));
}

async function routeStagedThemeRoots(
  staged: StagedGraph,
  conversationId: string,
): Promise<Map<number, RouteDecision>> {
  const state = useStore.getState();
  const conv = state.conversations.find((c) => c.id === conversationId);
  const activeProjectId = conv?.projectId ?? null;
  const adapter = makeStoreEmbeddingAdapter();
  const decisions = new Map<number, RouteDecision>();
  for (let i = 0; i < staged.nodes.length; i += 1) {
    const n = staged.nodes[i];
    if (!(n.tags ?? []).includes('themeKind:theme')) continue;
    const meta = readImportMeta(n);
    const queryText =
      meta?.firstAskTitle && meta.firstAskBody
        ? `${meta.firstAskTitle}\n\n${meta.firstAskBody}`
        : `${n.title}\n\n${n.contentMarkdown}`;
    const decision = await routeParent({
      firstTurn: queryText,
      conversationId,
      projectId: activeProjectId,
      nodes: state.nodes,
      conversations: state.conversations,
      activeProjectId,
      ...(adapter ? { embeddings: adapter } : {}),
    });
    decisions.set(i, decision);
  }
  return decisions;
}

/**
 * Build the embedding adapter used by routeParent. Honors
 * `settings.embeddings.provider`; returns `null` when the user hasn't
 * opted in (router falls back to token-overlap heuristic).
 */
function makeStoreEmbeddingAdapter(): EmbeddingScoringAdapter | null {
  const settings = useStore.getState().settings;
  const id = settings.embeddings?.provider ?? 'off';
  const provider = getEmbeddingProvider(id);
  if (!provider) return null;
  return {
    embed: (text) => provider.embed(text),
    resolveCandidate: async (node) => {
      if (node.embedding && node.embedding.length > 0) return node.embedding;
      const text = `${node.title}\n\n${node.contentMarkdown ?? ''}`.trim();
      if (!text) return null;
      const embedding = await provider.embed(text);
      // Persist so the next ingest doesn't recompute.
      useStore.getState().updateNode(node.id, { embedding });
      return embedding;
    },
  };
}

function readImportMeta(node: StagedNode): RootImportMeta | null {
  const fm = node.frontmatter as Record<string, unknown> | undefined;
  const meta = fm?.importMeta as RootImportMeta | undefined;
  if (!meta) return null;
  return meta;
}

function stripImportMeta(node: StagedNode): StagedNode {
  const fm = node.frontmatter as Record<string, unknown> | undefined;
  if (!fm || !('importMeta' in fm)) return node;
  const next: Record<string, unknown> = { ...fm };
  delete next.importMeta;
  const cleaned: StagedNode = {
    ...node,
    frontmatter: Object.keys(next).length > 0 ? next : undefined,
  };
  return cleaned;
}

/**
 * On `attach`, the staged root is skipped — but its collapsed first
 * user/assistant exchange would otherwise be lost. Re-emit it as a
 * separate ask + insight pair anchored to the existing canvas root.
 */
function reExpandFirstTurn(
  stagedRoot: StagedNode,
  existingRootId: string,
  conversationId: string,
): void {
  const meta = readImportMeta(stagedRoot);
  if (!meta) return;
  const store = useStore.getState();
  const existingRoot = store.nodes.find((n) => n.id === existingRootId);
  const anchor = existingRoot?.position ?? stagedRoot.position;
  const askPosition = { x: anchor.x, y: anchor.y + 160 };
  const insightPosition = { x: anchor.x + 320, y: anchor.y + 160 };
  const ask = store.addNode({
    conversationId,
    kind: 'markdown',
    title: meta.firstAskTitle || '(ask)',
    contentMarkdown: meta.firstAskBody,
    position: askPosition,
    tags: ['themeKind:ask', 'imported:conversation'],
    importance: stagedRoot.importance,
    themeId: existingRootId,
  });
  store.addEdge({
    sourceNodeId: existingRootId,
    targetNodeId: ask.id,
    kind: 'parent',
  });
  if (meta.firstReplyBody) {
    const insight = store.addNode({
      conversationId,
      kind: 'markdown',
      title: firstSentence(meta.firstReplyBody),
      contentMarkdown: meta.firstReplyBody,
      position: insightPosition,
      tags: ['themeKind:insight', 'imported:conversation'],
      importance: stagedRoot.importance,
      themeId: existingRootId,
    });
    store.addEdge({
      sourceNodeId: ask.id,
      targetNodeId: insight.id,
      kind: 'related',
      label: 'reply',
    });
  }
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '(reply)';
  const m = t.match(/^.{1,80}?[.。!?！？](\s|$)/);
  if (m) return m[0].trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

// `CanvasNode` referenced indirectly through the store; explicit import
// kept so future signature changes are caught at type-check time.
void (null as CanvasNode | null);
