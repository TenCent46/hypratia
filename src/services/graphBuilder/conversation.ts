import { llmComplete, parseJsonLoose, runChain } from './modelChain';
import type {
  ChainTier,
  ConversationClassification,
  ConversationTurn,
  StagedGraph,
} from './types';
import type { ThemeKind } from '../../types';

const TURN_MARKER_RE =
  /^\s*(user|human|me|q|質問|あなた|私)\s*[:>]\s*/i;
const REPLY_MARKER_RE =
  /^\s*(assistant|ai|bot|gpt|claude|model|reply|回答)\s*[:>]\s*/i;

const CHUNK_SIZE = 30;

const SYSTEM_PROMPT = [
  'You group user chat turns into thematic clusters for a conversation map.',
  'Reply with JSON only (no fences, no prose). Schema:',
  '[{ "index": number, "themeId": string|null, "isNew": boolean, "themeTitle": string, "askSummary": string, "themeKind": "ask"|"insight"|"decision", "importance": 1|2|3|4|5 }]',
  'Rules:',
  '- "themeId": when continuing an existing theme this batch already produced, reuse the same string id you returned earlier in this same array. Otherwise return null AND set "isNew" true; the host will mint a fresh id.',
  '- "themeTitle": <= 60 chars, sentence-case, descriptive of the theme cluster.',
  '- "askSummary": <= 80 chars, single line, paraphrase of the user turn.',
  '- "themeKind": almost always "ask"; reserve "insight"/"decision" for clear pivots.',
  '- "importance": 3 by default; bump to 4-5 for explicit comparisons / decisions.',
].join('\n');

/**
 * Parse turns out of a pasted chat blob. Anything between a user-marker
 * line and the next marker-of-any-kind is taken as that turn's content
 * (multi-line OK). Assistant turns are kept too because the LLM uses
 * their context to assign themes, but only user turns become nodes.
 */
export function parseTurns(text: string): ConversationTurn[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  type Pending = {
    role: 'user' | 'assistant';
    bodyLines: string[];
  };
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

/**
 * One LLM round-trip per chunk of up to `CHUNK_SIZE` user turns. The
 * existing themes from prior chunks are summarised in the prompt so
 * the model can reuse `themeId`s across chunks.
 */
async function classifyChunkLLM(
  model: { provider: string; model: string },
  userTurns: ConversationTurn[],
  priorThemes: Array<{ id: string; title: string }>,
  signal?: AbortSignal,
): Promise<ConversationClassification[] | null> {
  const userPrompt = [
    priorThemes.length > 0
      ? `Existing themes from earlier chunks (reuse these ids when appropriate):\n${priorThemes
          .map((t) => `- ${t.id} :: ${t.title}`)
          .join('\n')}`
      : 'No prior themes yet.',
    '',
    'User turns to classify:',
    ...userTurns.map((t) => `[#${t.index}] ${t.content}`),
    '',
    'Return the JSON array now.',
  ].join('\n');
  const raw = await llmComplete(
    { provider: model.provider as never, model: model.model },
    SYSTEM_PROMPT,
    userPrompt,
    signal,
  );
  const parsed = parseJsonLoose(raw);
  if (!Array.isArray(parsed)) return null;
  const out: ConversationClassification[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const idx = Number(obj.index);
    if (!Number.isFinite(idx)) continue;
    const themeId =
      typeof obj.themeId === 'string' && obj.themeId.length > 0
        ? obj.themeId
        : null;
    const isNew = themeId === null ? true : Boolean(obj.isNew);
    const themeKindRaw = obj.themeKind;
    const themeKind: ThemeKind =
      themeKindRaw === 'ask' ||
      themeKindRaw === 'insight' ||
      themeKindRaw === 'decision' ||
      themeKindRaw === 'theme'
        ? themeKindRaw
        : 'ask';
    const imp = Number(obj.importance);
    const importance: 1 | 2 | 3 | 4 | 5 =
      imp >= 1 && imp <= 5
        ? (Math.round(imp) as 1 | 2 | 3 | 4 | 5)
        : 3;
    out.push({
      index: idx,
      themeId,
      isNew,
      themeTitle: trimTo(String(obj.themeTitle ?? ''), 60) || 'Untitled theme',
      askSummary: trimTo(String(obj.askSummary ?? ''), 80) || '(empty)',
      themeKind,
      importance,
    });
  }
  return out.length > 0 ? out : null;
}

function trimTo(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function classifyChunkHeuristic(
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
 * Build a `StagedGraph` from a parsed conversation. Each unique
 * `themeId` becomes a `theme` root node; each user turn becomes an
 * `ask` child with a `parent` edge from its theme.
 */
export async function buildConversationGraph(
  text: string,
  chain: ChainTier[],
  signal?: AbortSignal,
): Promise<StagedGraph> {
  const turns = parseTurns(text);
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length === 0) {
    // Fall through to a single-node "no turns parsed" graph rather
    // than throwing — the user still sees something on the canvas.
    return {
      nodes: [
        themeRootNode('Conversation import', trimTo(text, 60), 3),
      ],
      edges: [],
    };
  }

  const allClassifications: ConversationClassification[] = [];
  const themesAcc = new Map<string, { id: string; title: string }>();
  for (let i = 0; i < userTurns.length; i += CHUNK_SIZE) {
    const chunk = userTurns.slice(i, i + CHUNK_SIZE);
    const prior = Array.from(themesAcc.values());
    const { value } = await runChain<ConversationClassification[]>(
      chain,
      async (model, sig) => classifyChunkLLM(model, chunk, prior, sig),
      () =>
        classifyChunkHeuristic(
          chunk,
          prior[prior.length - 1] ?? null,
        ),
      signal,
    );
    // Mint fresh ids for "isNew" themes, reuse existing ones.
    for (const c of value) {
      if (c.isNew || !c.themeId || !themesAcc.has(c.themeId)) {
        const localId = `theme:${themesAcc.size}`;
        themesAcc.set(localId, { id: localId, title: c.themeTitle });
        c.themeId = localId;
      }
    }
    allClassifications.push(...value);
  }

  // Build the staged graph.
  const nodes: StagedGraph['nodes'] = [];
  const edges: StagedGraph['edges'] = [];
  const themeIndexById = new Map<string, number>();
  for (const [id, t] of themesAcc) {
    themeIndexById.set(id, nodes.length);
    nodes.push(themeRootNode(t.title, t.title, 3));
  }
  for (const c of allClassifications) {
    if (!c.themeId) continue;
    const themeIndex = themeIndexById.get(c.themeId);
    if (themeIndex === undefined) continue;
    const askIndex = nodes.length;
    nodes.push(askChildNode(c.askSummary, c.themeKind, c.importance));
    edges.push({
      sourceIndex: themeIndex,
      targetIndex: askIndex,
      kind: 'parent',
    });
  }
  return { nodes, edges };
}

function themeRootNode(
  title: string,
  summary: string,
  importance: 1 | 2 | 3 | 4 | 5,
): StagedGraph['nodes'][number] {
  return {
    conversationId: '',
    kind: 'theme',
    title: trimTo(title, 60) || 'Theme',
    contentMarkdown: trimTo(summary, 80) || title,
    position: { x: 0, y: 0 },
    tags: ['themeKind:theme', 'imported:conversation'],
    importance,
  };
}

function askChildNode(
  summary: string,
  themeKind: ThemeKind,
  importance: 1 | 2 | 3 | 4 | 5,
): StagedGraph['nodes'][number] {
  return {
    conversationId: '',
    kind: 'theme',
    title: trimTo(summary, 60) || '(ask)',
    contentMarkdown: trimTo(summary, 80) || '(ask)',
    position: { x: 0, y: 0 },
    tags: [`themeKind:${themeKind}`, 'imported:conversation'],
    importance,
  };
}
