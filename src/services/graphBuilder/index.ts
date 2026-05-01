import { useStore } from '../../store';
import { buildModelChain } from './modelChain';
import { routeInput } from './router';
import { buildConversationGraph } from './conversation';
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
} from './types';

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

  const staged: StagedGraph =
    kind === 'conversation'
      ? await buildConversationGraph(text, chain, opts.signal)
      : await buildProseGraph(text, chain, opts.signal);

  // Position the staged nodes in a fresh region.
  const existing = summarizeExistingPositions(useStore.getState().nodes);
  const anchor = pickAnchorPosition(existing);
  layoutBatch(staged, kind, anchor);

  // Commit: add nodes first, capture their ids, then resolve edges.
  const idByIndex: string[] = [];
  for (const n of staged.nodes) {
    const created = useStore.getState().addNode({
      ...n,
      conversationId: opts.conversationId,
      themeId: undefined, // patched below for theme roots
    });
    idByIndex.push(created.id);
  }
  // Theme roots: set `themeId` to their own id so child clusters bind.
  staged.nodes.forEach((n, i) => {
    const tags = n.tags ?? [];
    if (tags.includes('themeKind:theme')) {
      useStore.getState().updateNode(idByIndex[i], { themeId: idByIndex[i] });
    }
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

  // Decide which tier "the build used" for the user-visible status —
  // prefer the content-tier when it differed from the router-tier; the
  // build-content step is heavier and more representative.
  const modelUsed = routerTier; // both ran the same chain; the surface is identical
  return {
    classifiedAs: kind as GraphInputKind,
    nodeCount: staged.nodes.length,
    edgeCount: staged.edges.length,
    modelUsed,
    durationMs: Math.round(performance.now() - started),
  };
}
