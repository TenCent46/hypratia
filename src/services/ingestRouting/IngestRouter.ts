/**
 * Chat-ingest similarity router (plan/v1/31, Step 1).
 *
 * Stable seam shared by every ingest path (CapturePreview, GraphImport,
 * live chat). Decides whether a newly-imported chat hangs off an
 * existing canvas theme root, surfaces an existing root as a
 * suggestion, or creates a fresh root.
 *
 * Step 1 scope: types, pure decision logic, and a conservative
 * heuristic-only `routeParent`. None of the existing import paths are
 * wired to it yet — that's Steps 2/3/7 in the plan. Embeddings and the
 * LLM classifier seam are deliberately not invoked here so this module
 * is a pure unit testable from `scripts/ingest-routing-check.ts`.
 *
 * Ground rules baked into this seam:
 *  - Cross-chat dedup happens at the parent/root level only. Children
 *    inside a single import never fold into pre-existing siblings —
 *    sessions matter as units.
 *  - Cross-project candidates can never auto-attach. They downgrade to
 *    `suggest` regardless of score.
 *  - Same-conversation matches stay silent (no toast in the eventual UI).
 */

import type { CanvasNode, Conversation, ID } from '../../types';
// Explicit `.ts` extension because the test runner uses node's
// --experimental-strip-types, which does not auto-resolve extensionless
// relative imports. tsconfig.json has allowImportingTsExtensions=true so
// the TS compiler is happy with this form.
import {
  HEURISTIC_TOKEN_OVERLAP_MIN,
  PARENT_AUTO_ATTACH_THRESHOLD,
  PARENT_SUGGEST_THRESHOLD,
  SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW,
} from './thresholds.ts';
import { cosineSimilarity, cosineToScore } from '../embeddings/cosine.ts';

export type RouteDecision =
  | {
      kind: 'attach';
      nodeId: ID;
      confidence: number;
      reason:
        | 'high-confidence-parent-match'
        | 'same-conversation-parent-match'
        | 'sibling-match';
    }
  | {
      kind: 'suggest';
      nodeId: ID;
      confidence: number;
      reason:
        | 'possible-parent-match'
        | 'cross-project-match'
        | 'below-auto-attach-threshold';
    }
  | {
      kind: 'new-root';
      reason:
        | 'no-candidates'
        | 'no-safe-match'
        | 'embedding-unavailable'
        | 'classifier-unavailable';
    };

/**
 * Pre-scored candidate fed to {@link chooseBestParentCandidate}. The
 * scoring layer (embedding cosine / classifier vote / token overlap)
 * builds these; the decision layer is pure.
 */
export type ScoredCandidate = {
  nodeId: ID;
  score: number;
  /** Candidate lives in the same project as the import. */
  sameProject: boolean;
  /** Candidate lives in the active conversation. */
  sameConversation: boolean;
  /**
   * True if the candidate's title shares ≥1 non-stopword token with the
   * query. Powers the safety net that refuses near-zero-overlap merges
   * below {@link SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW}.
   */
  shareNonStopwordToken: boolean;
};

// ---------- pure helpers ------------------------------------------------

/**
 * Semantic predicate — does this node act as a parent theme root for
 * cross-import dedup, regardless of its renderer kind?
 *
 * Plan/v1/31 corrective design: the `themeKind:theme` tag is the
 * source of truth for routing. The visual renderer (`kind: 'markdown'`
 * for imported / paste-style content, `kind: 'theme'` for live-chat
 * auto-summaries) is independent. Both shapes are routable parent
 * candidates as long as they carry the tag.
 *
 * Sub-classified nodes (`themeKind:ask` / `themeKind:insight` /
 * `themeKind:decision`) are deliberately excluded — they are leaves
 * under a parent root, not parent candidates themselves.
 */
export function isThemeRoot(node: CanvasNode): boolean {
  return (node.tags ?? []).includes('themeKind:theme');
}

/**
 * Resolve the project a node belongs to via its conversation. Returns
 * `null` for unprojected conversations (the user's "Inbox" / standalone
 * chats).
 */
export function getNodeProjectId(
  node: CanvasNode,
  conversations: Conversation[],
): ID | null {
  const conv = conversations.find((c) => c.id === node.conversationId);
  return conv?.projectId ?? null;
}

/** Title plus body, joined by space, for token-overlap scoring. */
export function extractCandidateText(node: CanvasNode): string {
  const parts: string[] = [];
  if (node.title) parts.push(node.title);
  if (node.contentMarkdown) parts.push(node.contentMarkdown);
  return parts.join(' ');
}

// English + JP stopwords. Not exhaustive — just enough to keep
// "the / です / こと" from anchoring matches.
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'then',
  'else',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'from',
  'is',
  'was',
  'were',
  'be',
  'been',
  'being',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'me',
  'my',
  'you',
  'your',
  'we',
  'us',
  'our',
  'they',
  'them',
  'their',
  'he',
  'she',
  'him',
  'her',
  'his',
  'as',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'what',
  'which',
  'who',
  'whom',
  'where',
  'when',
  'why',
  'how',
  'can',
  'could',
  'should',
  'would',
  'will',
  'about',
  'into',
  'than',
  'so',
  'no',
  'not',
  'the',
  'する',
  'した',
  'して',
  'です',
  'ます',
  'こと',
  'もの',
  'よう',
  'ため',
  'とき',
  'について',
  'である',
  'れる',
  'られる',
]);

/**
 * Lowercase, split on non-letter/non-number, drop stopwords and 1-char
 * tokens. The Unicode property classes catch hiragana / katakana / kanji
 * along with Latin so JP+EN mixed input works without a real tokenizer.
 */
export function tokenizeNonStopwords(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const tok of matches) {
    if (tok.length < 2) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

/**
 * Jaccard similarity over non-stopword tokens. Cheap, language-agnostic
 * fallback that works without an embedding provider — used as the Step 1
 * scoring path. Range: [0, 1].
 */
export function tokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(tokenizeNonStopwords(a));
  const bTokens = new Set(tokenizeNonStopwords(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersect = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) intersect += 1;
  }
  const union = aTokens.size + bTokens.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Count of shared non-stopword tokens. Used by the heuristic-only
 * fallback path to require {@link HEURISTIC_TOKEN_OVERLAP_MIN} shared
 * tokens before lifting a candidate into the suggest band.
 */
export function sharedTokenCount(a: string, b: string): number {
  const aTokens = new Set(tokenizeNonStopwords(a));
  const bTokens = new Set(tokenizeNonStopwords(b));
  let intersect = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) intersect += 1;
  }
  return intersect;
}

// ---------- decision logic ---------------------------------------------

function pickBestCandidate(
  candidates: ScoredCandidate[],
): ScoredCandidate | null {
  if (candidates.length === 0) return null;
  // Sort score desc → sameProject → sameConversation. Stable enough for
  // a tie-break order; ties on every axis return the first input.
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.sameProject !== b.sameProject) return a.sameProject ? -1 : 1;
    if (a.sameConversation !== b.sameConversation) {
      return a.sameConversation ? -1 : 1;
    }
    return 0;
  })[0];
}

/**
 * Pure decision rule. Given pre-scored candidates and the active
 * project context, decide attach / suggest / new-root.
 *
 * Order of the gates matters and is deliberate:
 *  1. No candidates → new-root.
 *  2. Best below the safety-overlap floor and lacking title overlap →
 *     new-root (defends against embedding hallucinations on short
 *     titles).
 *  3. Cross-project → never attach. Suggest if score reaches the
 *     suggest threshold, otherwise new-root.
 *  4. Same-conversation suggest band → silent attach (the user is
 *     plainly continuing the same chat).
 *  5. Same-project: ≥0.90 attach, ≥0.82 suggest, else new-root.
 */
export function chooseBestParentCandidate(
  candidates: ScoredCandidate[],
): RouteDecision {
  const best = pickBestCandidate(candidates);
  if (!best) return { kind: 'new-root', reason: 'no-candidates' };

  if (
    best.score < SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW &&
    !best.shareNonStopwordToken
  ) {
    return { kind: 'new-root', reason: 'no-safe-match' };
  }

  if (!best.sameProject) {
    if (best.score >= PARENT_SUGGEST_THRESHOLD) {
      return {
        kind: 'suggest',
        nodeId: best.nodeId,
        confidence: best.score,
        reason: 'cross-project-match',
      };
    }
    return { kind: 'new-root', reason: 'no-safe-match' };
  }

  if (best.sameConversation && best.score >= PARENT_SUGGEST_THRESHOLD) {
    return {
      kind: 'attach',
      nodeId: best.nodeId,
      confidence: best.score,
      reason: 'same-conversation-parent-match',
    };
  }

  if (best.score >= PARENT_AUTO_ATTACH_THRESHOLD) {
    return {
      kind: 'attach',
      nodeId: best.nodeId,
      confidence: best.score,
      reason: 'high-confidence-parent-match',
    };
  }

  if (best.score >= PARENT_SUGGEST_THRESHOLD) {
    return {
      kind: 'suggest',
      nodeId: best.nodeId,
      confidence: best.score,
      reason: 'possible-parent-match',
    };
  }

  return { kind: 'new-root', reason: 'no-safe-match' };
}

// ---------- public API ---------------------------------------------------

/**
 * Adapter that lifts the ingest router from token-overlap scoring onto
 * embedding-cosine scoring. When provided, `routeParent` calls
 * `embed(query)` once and `resolveCandidate(node)` per existing theme
 * root, then scores via cosine. The adapter owns persistence: it may
 * lazily compute and write the candidate's embedding back to the store.
 *
 * Callers without a provider configured pass `undefined`; the router
 * falls through to its token-overlap path. Plan/v1/31 Step 5.
 */
export type EmbeddingScoringAdapter = {
  embed: (text: string) => Promise<number[]>;
  /**
   * Return the candidate's embedding vector, computing-and-persisting if
   * needed. Returning `null` means the candidate cannot be scored — the
   * router treats those as score 0 (no signal).
   */
  resolveCandidate: (node: CanvasNode) => Promise<number[] | null>;
};

export type RouteParentInput = {
  firstTurn: string;
  conversationId: ID;
  projectId?: ID | null;
  nodes: CanvasNode[];
  conversations: Conversation[];
  /**
   * Project that the import "belongs to" for cross-project gating.
   * Defaults to `projectId`. Importers can pass an explicit value when
   * the import context (e.g. a dropped conversation) doesn't yet have a
   * conversation row in the store.
   */
  activeProjectId?: ID | null;
  /** Plan/v1/31 Step 5 — embedding-based scoring when present. */
  embeddings?: EmbeddingScoringAdapter;
};

/**
 * Score the import's first user turn against existing theme roots and
 * return the parent-routing decision.
 *
 * Step 1 implementation: pure heuristic (Jaccard token overlap on title
 * + body). The scoring path is intentionally weak so the router stays
 * conservative (mostly returns `new-root` unless the candidate is
 * obviously the same topic). Steps 2/3/5 will swap the scoring layer
 * for embeddings and classifier votes; the decision layer in
 * {@link chooseBestParentCandidate} stays as-is.
 */
export async function routeParent(
  input: RouteParentInput,
): Promise<RouteDecision> {
  const {
    firstTurn,
    conversationId,
    projectId,
    nodes,
    conversations,
    activeProjectId,
    embeddings,
  } = input;

  if (!firstTurn.trim()) {
    return { kind: 'new-root', reason: 'no-candidates' };
  }
  const candidates = nodes.filter(isThemeRoot);
  if (candidates.length === 0) {
    return { kind: 'new-root', reason: 'no-candidates' };
  }

  const effectiveProject =
    activeProjectId !== undefined ? activeProjectId : (projectId ?? null);
  const queryTokens = new Set(tokenizeNonStopwords(firstTurn));

  // Token-overlap signal is computed unconditionally because it powers
  // the safety net (`shareNonStopwordToken`) regardless of which scoring
  // path produced the score. Cheap (linear scan).
  const tokenScores = candidates.map((node) => {
    const candidateText = extractCandidateText(node);
    const candidateTokens = tokenizeNonStopwords(candidateText);
    let shareToken = false;
    for (const t of candidateTokens) {
      if (queryTokens.has(t)) {
        shareToken = true;
        break;
      }
    }
    return {
      nodeId: node.id,
      tokenScore: tokenOverlapScore(firstTurn, candidateText),
      shareNonStopwordToken: shareToken,
    };
  });

  let scored: ScoredCandidate[];
  let usedEmbeddings = false;
  if (embeddings) {
    // Embedding path: score = cosine(query, candidate). Walk candidates
    // sequentially so the adapter can lazily compute-and-persist
    // missing embeddings without spamming concurrent writes.
    usedEmbeddings = true;
    const queryEmbedding = await embeddings.embed(firstTurn);
    scored = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const node = candidates[i];
      const tok = tokenScores[i];
      const candidateEmbedding = await embeddings.resolveCandidate(node);
      const cos = candidateEmbedding
        ? cosineSimilarity(queryEmbedding, candidateEmbedding)
        : 0;
      const candidateProject = getNodeProjectId(node, conversations);
      const sameProject =
        effectiveProject === null
          ? candidateProject === null
          : candidateProject === effectiveProject;
      scored.push({
        nodeId: node.id,
        score: cosineToScore(cos),
        sameProject,
        sameConversation: node.conversationId === conversationId,
        shareNonStopwordToken: tok.shareNonStopwordToken,
      });
    }
  } else {
    // Heuristic path: token-overlap Jaccard.
    scored = candidates.map((node, i) => {
      const tok = tokenScores[i];
      const candidateProject = getNodeProjectId(node, conversations);
      const sameProject =
        effectiveProject === null
          ? candidateProject === null
          : candidateProject === effectiveProject;
      return {
        nodeId: node.id,
        score: tok.tokenScore,
        sameProject,
        sameConversation: node.conversationId === conversationId,
        shareNonStopwordToken: tok.shareNonStopwordToken,
      };
    });
  }

  // Pure-heuristic conservatism: while we ONLY have token overlap, do
  // not lift a candidate into the suggest band unless the raw shared
  // token count clears the heuristic floor. Embedding-backed paths
  // bypass this guard — cosine over a real semantic embedding is a
  // strong enough signal on its own.
  if (!usedEmbeddings) {
    const ranked = [...scored].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (top && top.score >= PARENT_SUGGEST_THRESHOLD) {
      const candidateNode = candidates.find((n) => n.id === top.nodeId);
      if (candidateNode) {
        const overlap = sharedTokenCount(
          firstTurn,
          extractCandidateText(candidateNode),
        );
        if (overlap < HEURISTIC_TOKEN_OVERLAP_MIN) {
          return { kind: 'new-root', reason: 'no-safe-match' };
        }
      }
    }
  }

  return chooseBestParentCandidate(scored);
}

export type RouteChildInput = {
  turn: string;
  parentRootId: ID;
  importedSoFar: CanvasNode[];
  nodes: CanvasNode[];
};

/**
 * Step 1 stub for within-import child routing. Always falls back to
 * "attach to the parent root" — confidence 0 signals this is the
 * default-route, not a real similarity match. Step 2 will replace the
 * body with embedding-based sibling matching against
 * {@link RouteChildInput.importedSoFar}.
 *
 * The reason `'sibling-match'` is reused here because the parent root
 * is the trivial case of an in-import sibling candidate; callers should
 * treat `confidence === 0` as "no signal yet" and behave exactly as
 * they did before the router existed.
 */
export async function routeChild(
  input: RouteChildInput,
): Promise<RouteDecision> {
  return {
    kind: 'attach',
    nodeId: input.parentRootId,
    confidence: 0,
    reason: 'sibling-match',
  };
}
