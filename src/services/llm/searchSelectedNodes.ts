import { chat } from './index';
import type { CanvasNode, ModelRef } from '../../types';

export type LlmSearchMatch = {
  nodeId: string;
  title: string;
  snippet: string;
  reason: string;
};

export type LlmSearchArgs = {
  query: string;
  nodes: CanvasNode[];
  model: ModelRef;
  signal?: AbortSignal;
};

const PER_NODE_CONTENT_LIMIT = 600;
const MAX_NODES = 60;
const SNIPPET_LIMIT = 240;

const SYSTEM_PROMPT = [
  'You are a semantic search tool over a small set of user notes. Each note has an id, title, and a content excerpt.',
  'The user will give you a natural-language query (e.g. "did I write anything about X?", "「___」みたいなこと書いてなかったっけ?").',
  '',
  'Return ONLY valid JSON in this exact shape — no prose, no Markdown fences:',
  '{ "matches": [ { "id": "<note id>", "reason": "<one short sentence explaining the match, in the same language as the user query>" } ] }',
  '',
  'Rules:',
  '- Match on meaning, not just keyword overlap.',
  '- Include 0–10 matches, ordered by relevance (best first).',
  '- "id" MUST be one of the ids supplied below. Never invent ids.',
  '- If nothing fits, return {"matches": []}.',
  '- Keep "reason" short (≤ 1 sentence).',
].join('\n');

function buildUserPrompt(query: string, nodes: CanvasNode[]): string {
  const blocks = nodes.map((n) => {
    const title = n.title?.trim() || '(untitled)';
    const content = (n.contentMarkdown ?? '').replace(/\s+/g, ' ').trim();
    const trimmed =
      content.length > PER_NODE_CONTENT_LIMIT
        ? `${content.slice(0, PER_NODE_CONTENT_LIMIT)}…`
        : content;
    return `id: ${n.id}\ntitle: ${title}\ncontent: ${trimmed}`;
  });
  return [
    `Query: ${query.trim()}`,
    '',
    'Notes:',
    blocks.join('\n---\n'),
  ].join('\n');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body);
}

function makeSnippet(content: string): string {
  const flat = (content ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_LIMIT ? `${flat.slice(0, SNIPPET_LIMIT)}…` : flat;
}

export async function searchNodesWithLlm(
  args: LlmSearchArgs,
): Promise<LlmSearchMatch[]> {
  const { query, nodes, model, signal } = args;
  if (!query.trim() || nodes.length === 0) return [];

  // Future: pre-filter via embeddings before sending to the LLM. For now
  // we just cap at MAX_NODES so a giant selection doesn't blow up the
  // prompt — the user can narrow their selection if they hit the cap.
  const candidates = nodes.slice(0, MAX_NODES);
  const byId = new Map(candidates.map((n) => [n.id, n]));

  const result = await chat.complete(
    {
      provider: model.provider,
      model: model.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(query, candidates) },
      ],
    },
    signal,
  );

  let parsed: unknown;
  try {
    parsed = extractJson(result.text);
  } catch (err) {
    // tsconfig targets ES2020 — ErrorOptions (`{ cause }`) lands at ES2022,
    // so attach via Object.assign to satisfy the preserve-caught-error rule
    // without bumping the project-wide lib.
    throw Object.assign(
      new Error(
        `LLM returned non-JSON output: ${(err as Error).message}\n\n${result.text.slice(0, 400)}`,
      ),
      { cause: err },
    );
  }

  const raw =
    parsed && typeof parsed === 'object' && 'matches' in parsed
      ? (parsed as { matches: unknown }).matches
      : null;
  if (!Array.isArray(raw)) return [];

  const out: LlmSearchMatch[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const id = (m as { id?: unknown }).id;
    const reason = (m as { reason?: unknown }).reason;
    if (typeof id !== 'string') continue;
    const node = byId.get(id);
    if (!node) continue;
    out.push({
      nodeId: node.id,
      title: node.title?.trim() || '(untitled)',
      snippet: makeSnippet(node.contentMarkdown ?? ''),
      reason: typeof reason === 'string' ? reason : '',
    });
  }
  return out;
}
