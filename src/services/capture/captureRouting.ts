/**
 * Pure helpers for the Capture / ChatGPT-export ingest path. Wraps the
 * generic `IngestRouter.routeParent` decision into the concrete shape
 * `CapturePreview.applyToCanvas` needs (root draft, toast string,
 * suggested-node pointer).
 *
 * Kept pure (no React, no store, no Tauri) so it can be exercised from
 * `scripts/capture-routing-check.ts` without touching the runtime.
 */

import type { CanvasNode, Conversation, ID } from '../../types';
import type { RouteDecision } from '../ingestRouting/IngestRouter.ts';
import type { ParsedConversation } from './PasteCapture.ts';

export type CaptureRootDraft = {
  conversationId: ID;
  kind: 'markdown';
  title: string;
  contentMarkdown: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  tags: string[];
  /**
   * Suggested-related pointer recorded on the new root's frontmatter
   * when the router returned `suggest`. The UI will eventually surface
   * this as a one-click "link to existing topic" affordance; until then
   * it lives quietly in the node's metadata so no information is lost.
   */
  frontmatter?: Record<string, unknown>;
};

export type CapturePlan =
  | {
      kind: 'attach-existing';
      /** Existing canvas node id that becomes this import's root. */
      rootNodeId: ID;
      /**
       * The existing root's position. Used by the caller as the layout
       * anchor for the import's children so they cluster around the
       * matched root rather than the user's drop point.
       */
      rootPosition: { x: number; y: number };
      /** "Linked to existing topic: {title}" — already i18n-ready. */
      toast: string;
      /** The router's confidence reason, kept for telemetry / debugging. */
      reason: 'high-confidence-parent-match' | 'same-conversation-parent-match';
    }
  | {
      kind: 'create-new-root';
      rootDraft: CaptureRootDraft;
      rootPosition: { x: number; y: number };
      /** Optional toast surfacing a `suggest` decision. */
      toast?: string;
      /** Existing node id surfaced as a related suggestion (suggest decision only). */
      suggestedNodeId?: ID;
    };

/**
 * Pick the text we feed to {@link routeParent}. Priority:
 *   1. First user turn (chat-shaped input).
 *   2. First Markdown heading (1–6 #s) in the only-assistant fallback.
 *   3. First non-empty paragraph of the only-assistant fallback.
 *   4. The parsed conversation title.
 */
export function extractParentCandidateText(
  parsed: ParsedConversation,
): string {
  const firstUser = parsed.turns.find((t) => t.role === 'user');
  const userBody = firstUser?.content?.trim();
  if (userBody) return userBody;

  // PasteCapture stuffs all content into a single assistant turn when no
  // role markers were detected — that's our "prose" fallback path.
  const onlyAssistant = parsed.turns[0]?.content?.trim() ?? '';
  if (!onlyAssistant) return parsed.title.trim();

  const headingMatch = onlyAssistant.match(/^\s*#{1,6}\s+(.+)$/m);
  const heading = headingMatch?.[1]?.trim();
  if (heading) return heading;

  const para = onlyAssistant.split(/\n\s*\n/)[0]?.trim();
  if (para) return para;

  return parsed.title.trim();
}

/** Project the importing conversation belongs to (or `null` for unprojected). */
export function captureActiveProjectId(
  conversationId: ID,
  conversations: Conversation[],
): ID | null {
  return (
    conversations.find((c) => c.id === conversationId)?.projectId ?? null
  );
}

/**
 * Build the addNode input for a fresh capture root. Renders as a
 * familiar MarkdownNode (`kind: 'markdown'`) — the imported chat is
 * the user's content, not an auto-generated summary, so it should
 * NOT use the ThemeNode look. Semantic role lives on tags so
 * `routeParent` still picks it up as a parent-match candidate
 * (plan/v1/31 corrective design — split visual kind from semantic
 * role). The caller follows up with
 * `updateNode(created.id, { themeId: created.id })` because the id
 * isn't known until the node is created.
 */
export function buildCaptureRootDraft(args: {
  conversationId: ID;
  title: string;
  body: string;
  position: { x: number; y: number };
  /** Existing-node id to record as a "related" hint when this root is the
   *  result of a `suggest` decision. Stored under frontmatter so a future
   *  UI surface can offer to promote it to a real link. */
  suggestedNodeId?: ID;
  suggestedConfidence?: number;
}): CaptureRootDraft {
  const draft: CaptureRootDraft = {
    conversationId: args.conversationId,
    kind: 'markdown',
    title: args.title.trim() || 'Pasted conversation',
    contentMarkdown: args.body,
    position: args.position,
    width: 320,
    height: 180,
    tags: ['themeKind:theme', 'imported:conversation'],
  };
  if (args.suggestedNodeId) {
    draft.frontmatter = {
      relatedSuggestion: {
        nodeId: args.suggestedNodeId,
        ...(args.suggestedConfidence !== undefined
          ? { confidence: args.suggestedConfidence }
          : {}),
      },
    };
  }
  return draft;
}

/**
 * Translate an {@link IngestRouter.routeParent} decision into the
 * concrete `CapturePlan` the apply-to-canvas flow can execute.
 *
 * Pure: no store reads, no addNode calls. The caller materialises the
 * plan by either using the returned `rootNodeId` directly (`attach-existing`)
 * or feeding `rootDraft` into `addNode` (`create-new-root`).
 */
export function planCaptureRouting(args: {
  decision: RouteDecision;
  nodes: CanvasNode[];
  fallbackPosition: { x: number; y: number };
  conversationId: ID;
  titleDraft: string;
  bodyMarkdown: string;
}): CapturePlan {
  const { decision, nodes, fallbackPosition } = args;

  if (decision.kind === 'attach') {
    // Per the plan, only `high-confidence-parent-match` and
    // `same-conversation-parent-match` reach this branch via routeParent
    // (cross-project decisions are demoted to `suggest` upstream). Defend
    // the invariant anyway: if the existing node has somehow disappeared
    // between routing and applying, fall through to `create-new-root`.
    const existing = nodes.find((n) => n.id === decision.nodeId);
    if (existing) {
      const reason: 'high-confidence-parent-match' | 'same-conversation-parent-match' =
        decision.reason === 'sibling-match'
          ? 'high-confidence-parent-match' // sibling-match never produced by routeParent today
          : decision.reason;
      const silent = reason === 'same-conversation-parent-match';
      return {
        kind: 'attach-existing',
        rootNodeId: existing.id,
        rootPosition: existing.position,
        toast: silent
          ? '' // caller checks falsy and skips
          : `Linked to existing topic: "${existing.title || 'Untitled'}"`,
        reason,
      };
    }
  }

  const isSuggest = decision.kind === 'suggest';
  const suggestedNodeId = isSuggest ? decision.nodeId : undefined;
  const suggestedConfidence = isSuggest ? decision.confidence : undefined;
  const suggestedNode = suggestedNodeId
    ? nodes.find((n) => n.id === suggestedNodeId)
    : undefined;

  const rootDraft = buildCaptureRootDraft({
    conversationId: args.conversationId,
    title: args.titleDraft,
    body: args.bodyMarkdown,
    position: fallbackPosition,
    suggestedNodeId,
    suggestedConfidence,
  });

  return {
    kind: 'create-new-root',
    rootDraft,
    rootPosition: fallbackPosition,
    ...(suggestedNode
      ? {
          toast: `Similar topic found: "${suggestedNode.title || 'Untitled'}"`,
          suggestedNodeId: suggestedNode.id,
        }
      : {}),
  };
}
