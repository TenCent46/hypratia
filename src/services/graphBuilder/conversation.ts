// `.ts` extensions on runtime imports because the test runner uses
// node's --experimental-strip-types. tsconfig has allowImportingTsExtensions=true.
import { llmComplete, parseJsonLoose, runChain } from './modelChain.ts';
import {
  ASSISTANT_BODY_CAP,
  assembleStagedGraph,
  classifyChunkHeuristic,
  pairTurns,
  parseTurns,
  themeRootNode,
  trimTo,
} from './conversationAssembly.ts';
import type {
  ChainTier,
  ConversationClassification,
  ConversationTurn,
  StagedGraph,
} from './types.ts';
import type { ThemeKind } from '../../types';
import { LLM_FALLBACK_TOPK } from '../ingestRouting/thresholds.ts';

// Re-export the pure helpers + types so callers (and tests) keep their
// existing import paths working. `RootImportMeta` is the contract the
// host (`graphBuilder/index.ts`) reads to re-expand collapsed first
// turns on attach.
export {
  ASSISTANT_BODY_CAP,
  assembleStagedGraph,
  pairTurns,
  parseTurns,
  USER_BODY_CAP,
} from './conversationAssembly.ts';
export type {
  RootImportMeta,
  TurnPair,
} from './conversationAssembly.ts';
void ASSISTANT_BODY_CAP; // keep the runtime symbol in scope (unused locally)

const CHUNK_SIZE = 30;

const SYSTEM_PROMPT = [
  'You group user chat turns into thematic clusters for a conversation map.',
  'Reply with JSON only (no fences, no prose). Schema:',
  '[{ "index": number, "themeId": string|null, "isNew": boolean, "themeTitle": string, "askSummary": string, "themeKind": "ask"|"insight"|"decision", "importance": 1|2|3|4|5 }]',
  'Rules:',
  '- "themeId": when continuing an existing theme this batch already produced, reuse the same string id you returned earlier in this same array. You may also reuse an id from the "Existing themes" list — that signals continuity with a prior import. Otherwise return null AND set "isNew" true; the host will mint a fresh id.',
  '- "themeTitle": <= 60 chars, sentence-case, descriptive of the theme cluster.',
  '- "askSummary": <= 80 chars, single line, paraphrase of the user turn.',
  '- "themeKind": almost always "ask"; reserve "insight"/"decision" for clear pivots.',
  '- "importance": 3 by default; bump to 4-5 for explicit comparisons / decisions.',
].join('\n');

/**
 * One LLM round-trip per chunk of up to `CHUNK_SIZE` user turns. Existing
 * themes from prior chunks AND from the active project's canvas are
 * summarised in the prompt so the model can reuse `themeId`s across
 * chunks AND across imports (plan/v1/31 Step 3B).
 */
async function classifyChunkLLM(
  model: { provider: string; model: string },
  userTurns: ConversationTurn[],
  priorThemes: Array<{ id: string; title: string }>,
  signal?: AbortSignal,
): Promise<ConversationClassification[] | null> {
  const userPrompt = [
    priorThemes.length > 0
      ? `Existing themes (reuse these ids when appropriate):\n${priorThemes
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

export type BuildConversationGraphOptions = {
  /**
   * Plan/v1/31 Step 3B — existing canvas theme roots in the active
   * project, fed to the LLM classifier so it can return one of these
   * ids as the theme for a user turn (a cross-import dedup signal).
   * Capped at {@link LLM_FALLBACK_TOPK} most-recently-updated entries
   * by the host.
   */
  existingThemes?: Array<{ id: string; title: string }>;
};

/**
 * Build a `StagedGraph` from a parsed conversation. Plan/v1/31 Step 4:
 * the first user/assistant exchange of each theme is collapsed into
 * the theme root; subsequent turns become ask + insight node pairs
 * connected via `parent` and `related (label=reply)` edges.
 *
 * The collapsed first-turn data is stashed on `frontmatter.importMeta`
 * so `graphBuilder/index.ts` can re-expand it as a separate ask + insight
 * pair when the root is attached to an existing canvas theme.
 */
export async function buildConversationGraph(
  text: string,
  chain: ChainTier[],
  signal?: AbortSignal,
  opts?: BuildConversationGraphOptions,
): Promise<StagedGraph> {
  const turns = parseTurns(text);
  const pairs = pairTurns(turns);
  if (pairs.length === 0) {
    return {
      nodes: [
        themeRootNode('Conversation import', trimTo(text, 60), 3),
      ],
      edges: [],
    };
  }

  const userTurns = pairs.map((p) => p.user);
  const allClassifications: ConversationClassification[] = [];
  const themesAcc = new Map<string, { id: string; title: string }>();
  if (opts?.existingThemes) {
    const capped = opts.existingThemes.slice(0, LLM_FALLBACK_TOPK);
    for (const t of capped) themesAcc.set(t.id, t);
  }
  for (let i = 0; i < userTurns.length; i += CHUNK_SIZE) {
    const chunk = userTurns.slice(i, i + CHUNK_SIZE);
    const prior = Array.from(themesAcc.values()).map((t) => ({
      id: t.id,
      title: t.title,
    }));
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
    for (const c of value) {
      if (c.isNew || !c.themeId || !themesAcc.has(c.themeId)) {
        const localId = `theme:${themesAcc.size}`;
        themesAcc.set(localId, { id: localId, title: c.themeTitle });
        c.themeId = localId;
      }
    }
    allClassifications.push(...value);
  }

  return assembleStagedGraph(allClassifications, pairs, themesAcc);
}
