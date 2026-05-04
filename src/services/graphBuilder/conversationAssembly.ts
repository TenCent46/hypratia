/**
 * Pure assembly helpers extracted from `conversation.ts` so they can be
 * exercised from a node strip-types check script without dragging in
 * the `modelChain` runtime (which transitively imports the LLM SDKs and
 * Tauri secrets service). Plan/v1/31 Steps 3 + 4.
 */

import type {
  ConversationClassification,
  ConversationTurn,
  StagedGraph,
  StagedNode,
} from './types.ts';
import type { ThemeKind } from '../../types';
import {
  REPLY_MARKER_RE,
  TURN_MARKER_RE,
  normalizeTranscript,
} from '../capture/transcriptNormalize.ts';

/** Hard cap on the assistant body landed on the canvas. */
export const ASSISTANT_BODY_CAP = 8 * 1024;
export const USER_BODY_CAP = 4 * 1024;

/**
 * Parse turns out of a pasted chat blob. Anything between a user-marker
 * line and the next marker-of-any-kind is taken as that turn's content
 * (multi-line OK). Both user and assistant turns are kept so callers
 * can pair them via {@link pairTurns}.
 */
export function parseTurns(text: string): ConversationTurn[] {
  // Normalise first so Claude.ai noise (date stamps, file metadata,
  // operation logs, consecutive duplicates) doesn't confuse the
  // marker-based scanner.
  const cleaned = normalizeTranscript(text);
  const lines = cleaned.split('\n');
  type Pending = { role: 'user' | 'assistant'; bodyLines: string[] };
  const turns: ConversationTurn[] = [];
  let cur: Pending | null = null;
  let idxCounter = 0;
  function flush() {
    if (!cur) return;
    const body = cur.bodyLines.join('\n').trim();
    if (body) {
      turns.push({ index: idxCounter++, role: cur.role, content: body });
    }
    cur = null;
  }
  for (const line of lines) {
    const userMatch = line.match(TURN_MARKER_RE);
    const replyMatch = line.match(REPLY_MARKER_RE);
    if (userMatch) {
      flush();
      cur = { role: 'user', bodyLines: [line.slice(userMatch[0].length)] };
      continue;
    }
    if (replyMatch) {
      flush();
      cur = { role: 'assistant', bodyLines: [line.slice(replyMatch[0].length)] };
      continue;
    }
    if (cur) cur.bodyLines.push(line);
  }
  flush();
  return turns;
}

export type TurnPair = {
  user: ConversationTurn;
  assistant: ConversationTurn | null;
};

/**
 * Pair each user turn with the next assistant turn that follows it in
 * source order. Trailing or interleaved unpaired user turns get a
 * `null` reply so callers can still emit an ask without an insight.
 */
export function pairTurns(turns: ConversationTurn[]): TurnPair[] {
  const pairs: TurnPair[] = [];
  for (let i = 0; i < turns.length; i += 1) {
    const t = turns[i];
    if (t.role !== 'user') continue;
    let reply: ConversationTurn | null = null;
    for (let j = i + 1; j < turns.length; j += 1) {
      const next = turns[j];
      if (next.role === 'assistant') {
        reply = next;
        break;
      }
      if (next.role === 'user') break;
    }
    pairs.push({ user: t, assistant: reply });
  }
  return pairs;
}

export type RootImportMeta = {
  firstAskTitle: string;
  firstAskBody: string;
  firstReplyBody: string;
};

export function trimTo(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

export function trimBody(s: string, cap: number): string {
  const t = s.trim();
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}\n\n…[truncated at ${cap} chars]`;
}

export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^.{1,80}?[.。!?！？](\s|$)/);
  if (m) return m[0].trim();
  return trimTo(t, 80);
}

export function classifyChunkHeuristic(
  userTurns: ConversationTurn[],
  priorRoot: { id: string; title: string } | null,
): ConversationClassification[] {
  const root = priorRoot ?? {
    id: 'theme:0',
    title: trimTo(userTurns[0]?.content ?? 'Theme', 60),
  };
  return userTurns.map((t) => ({
    index: t.index,
    themeId: root.id,
    isNew: false,
    themeTitle: root.title,
    askSummary: trimTo(t.content, 80),
    themeKind: 'ask' as ThemeKind,
    importance: 3 as const,
  }));
}

/**
 * Imported chat / capture roots render as the user's familiar
 * MarkdownNode (`kind: 'markdown'`) — NOT as the auto-summary
 * `ThemeNode` used by live chat. The `themeKind:theme` tag carries the
 * semantic role so `routeParent` still treats this node as a candidate
 * parent. Plan/v1/31 corrective design — split visual renderer from
 * semantic role.
 */
export function themeRootNode(
  title: string,
  body: string,
  importance: 1 | 2 | 3 | 4 | 5,
  importMeta?: RootImportMeta,
): StagedNode {
  return {
    conversationId: '',
    kind: 'markdown',
    title: trimTo(title, 60) || 'Theme',
    contentMarkdown: body,
    position: { x: 0, y: 0 },
    tags: ['themeKind:theme', 'imported:conversation'],
    importance,
    ...(importMeta
      ? { frontmatter: { importMeta: importMeta as Record<string, unknown> } }
      : {}),
  };
}

export function askNode(
  summary: string,
  body: string,
  importance: 1 | 2 | 3 | 4 | 5,
): StagedNode {
  return {
    conversationId: '',
    kind: 'markdown',
    title: trimTo(summary, 60) || '(ask)',
    contentMarkdown: body,
    position: { x: 0, y: 0 },
    tags: ['themeKind:ask', 'imported:conversation'],
    importance,
  };
}

export function insightNode(
  summary: string,
  body: string,
  importance: 1 | 2 | 3 | 4 | 5,
): StagedNode {
  return {
    conversationId: '',
    kind: 'markdown',
    title: trimTo(summary, 60) || '(reply)',
    contentMarkdown: body,
    position: { x: 0, y: 0 },
    tags: ['themeKind:insight', 'imported:conversation'],
    importance,
  };
}

/**
 * Assemble a `StagedGraph` from classifier output + paired turns. Pure:
 * no LLM, no store, no Tauri.
 *
 * Behaviour (plan/v1/31 Step 4):
 *  - For every theme, the FIRST user/assistant exchange is collapsed
 *    into the theme root: root.title = first askSummary,
 *    root.contentMarkdown = first assistant body, importMeta carries
 *    the original first turn so the host can re-expand on attach.
 *  - Subsequent turns of the same theme become ask + insight node
 *    pairs with edges:
 *      root --(parent)--> ask --(related, label=reply)--> insight
 */
export function assembleStagedGraph(
  classifications: ConversationClassification[],
  pairs: TurnPair[],
  themesAcc: Map<string, { id: string; title: string }>,
): StagedGraph {
  const turnsByTheme = new Map<string, number[]>();
  for (const c of classifications) {
    if (!c.themeId) continue;
    const list = turnsByTheme.get(c.themeId) ?? [];
    list.push(c.index);
    turnsByTheme.set(c.themeId, list);
  }
  const classByTurn = new Map<number, ConversationClassification>();
  for (const c of classifications) classByTurn.set(c.index, c);
  const pairByTurn = new Map<number, TurnPair>();
  for (const p of pairs) pairByTurn.set(p.user.index, p);

  const nodes: StagedNode[] = [];
  const edges: StagedGraph['edges'] = [];
  const themeIndexById = new Map<string, number>();

  for (const [themeId, theme] of themesAcc) {
    const turnIndices = turnsByTheme.get(themeId) ?? [];
    if (turnIndices.length === 0) continue;
    const firstClass = classByTurn.get(turnIndices[0]);
    const firstPair = pairByTurn.get(turnIndices[0]);
    if (!firstClass || !firstPair) continue;
    const themeIndex = nodes.length;
    themeIndexById.set(themeId, themeIndex);
    nodes.push(
      themeRootNode(
        firstClass.askSummary || theme.title,
        firstPair.assistant
          ? trimBody(firstPair.assistant.content, ASSISTANT_BODY_CAP)
          : trimTo(theme.title, 80),
        firstClass.importance,
        {
          firstAskTitle: firstClass.askSummary,
          firstAskBody: trimBody(firstPair.user.content, USER_BODY_CAP),
          firstReplyBody: firstPair.assistant
            ? trimBody(firstPair.assistant.content, ASSISTANT_BODY_CAP)
            : '',
        },
      ),
    );
  }

  for (const [themeId, indices] of turnsByTheme) {
    const themeIndex = themeIndexById.get(themeId);
    if (themeIndex === undefined) continue;
    indices.forEach((turnIdx, ord) => {
      if (ord === 0) return; // collapsed into the root
      const c = classByTurn.get(turnIdx);
      const pair = pairByTurn.get(turnIdx);
      if (!c || !pair) return;
      const askIndex = nodes.length;
      nodes.push(
        askNode(
          c.askSummary,
          trimBody(pair.user.content, USER_BODY_CAP),
          c.importance,
        ),
      );
      edges.push({
        sourceIndex: themeIndex,
        targetIndex: askIndex,
        kind: 'parent',
      });
      if (pair.assistant) {
        const insightIndex = nodes.length;
        nodes.push(
          insightNode(
            firstSentence(pair.assistant.content),
            trimBody(pair.assistant.content, ASSISTANT_BODY_CAP),
            c.importance,
          ),
        );
        edges.push({
          sourceIndex: askIndex,
          targetIndex: insightIndex,
          kind: 'related',
          label: 'reply',
        });
      }
    });
  }

  return { nodes, edges };
}
