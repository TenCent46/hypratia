import { llmComplete, parseJsonLoose, runChain } from './modelChain';
import type {
  ChainTier,
  ProseConcept,
  ProseEdge,
  StagedGraph,
} from './types';

const MAX_INPUT_CHARS = 24_000;
const MAX_CONCEPTS = 24;

const SYSTEM_PROMPT = [
  'You extract a small concept graph from a piece of prose.',
  'Reply with JSON only (no fences, no prose). Schema:',
  '{',
  '  "concepts": [{ "id": string, "title": string, "summary": string, "importance": 1|2|3|4|5 }],',
  '  "edges": [{ "source": string, "target": string, "label"?: string }]',
  '}',
  'Rules:',
  `- At most ${MAX_CONCEPTS} concepts. Choose the ones most central to the text.`,
  '- Each "id" is short, ascii-snake-case, unique within concepts.',
  '- "title" <= 60 chars; "summary" <= 80 chars, single line.',
  '- "importance": 5 = central; 1 = aside.',
  '- "edges" connect related concepts (no parent/child); 1-3 edges per central concept is plenty.',
  '- "source"/"target" must be valid concept ids from the same response.',
].join('\n');

async function extractGraphLLM(
  model: { provider: string; model: string },
  text: string,
  signal?: AbortSignal,
): Promise<{ concepts: ProseConcept[]; edges: ProseEdge[] } | null> {
  const sample = text.slice(0, MAX_INPUT_CHARS);
  const userPrompt = `INPUT (${sample.length} chars):\n${sample}\n\nReturn the JSON now.`;
  const raw = await llmComplete(
    { provider: model.provider as never, model: model.model },
    SYSTEM_PROMPT,
    userPrompt,
    signal,
  );
  const parsed = parseJsonLoose(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const concepts = normalizeConcepts(obj.concepts);
  if (concepts.length === 0) return null;
  const idSet = new Set(concepts.map((c) => c.id));
  const edges = normalizeEdges(obj.edges, idSet);
  return { concepts, edges };
}

function normalizeConcepts(raw: unknown): ProseConcept[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: ProseConcept[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const idRaw = String(o.id ?? '').trim();
    if (!idRaw) continue;
    const id = idRaw.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const title = trimTo(String(o.title ?? ''), 60) || id;
    const summary = trimTo(String(o.summary ?? ''), 80);
    const imp = Number(o.importance);
    const importance: 1 | 2 | 3 | 4 | 5 =
      imp >= 1 && imp <= 5
        ? (Math.round(imp) as 1 | 2 | 3 | 4 | 5)
        : 3;
    out.push({ id, title, summary, importance });
    if (out.length >= MAX_CONCEPTS) break;
  }
  return out;
}

function normalizeEdges(raw: unknown, ids: Set<string>): ProseEdge[] {
  if (!Array.isArray(raw)) return [];
  const out: ProseEdge[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const source = String(o.source ?? '').trim();
    const target = String(o.target ?? '').trim();
    if (!source || !target || source === target) continue;
    if (!ids.has(source) || !ids.has(target)) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = typeof o.label === 'string'
      ? trimTo(o.label, 40)
      : undefined;
    out.push(label ? { source, target, label } : { source, target });
  }
  return out;
}

/**
 * Heuristic fallback: split prose by paragraphs; the first sentence of
 * each paragraph becomes a concept title. No edges.
 */
function extractGraphHeuristic(text: string): {
  concepts: ProseConcept[];
  edges: ProseEdge[];
} {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, MAX_CONCEPTS);
  const concepts: ProseConcept[] = paragraphs.map((p, i) => {
    const sentenceEnd = p.search(/[.!?。！？]/);
    const cut = sentenceEnd > 0 ? sentenceEnd + 1 : p.length;
    const title = trimTo(p.slice(0, cut), 60) || `Concept ${i + 1}`;
    const summary = trimTo(p.slice(cut).trim() || p, 80);
    return { id: `concept_${i}`, title, summary, importance: 3 };
  });
  return { concepts, edges: [] };
}

export async function buildProseGraph(
  text: string,
  chain: ChainTier[],
  signal?: AbortSignal,
): Promise<StagedGraph> {
  const { value } = await runChain<{
    concepts: ProseConcept[];
    edges: ProseEdge[];
  }>(
    chain,
    async (model, sig) => extractGraphLLM(model, text, sig),
    () => extractGraphHeuristic(text),
    signal,
  );

  const nodes: StagedGraph['nodes'] = value.concepts.map((c) => ({
    conversationId: '',
    kind: 'theme' as const,
    title: c.title,
    contentMarkdown: c.summary || c.title,
    position: { x: 0, y: 0 },
    tags: ['themeKind:theme', 'imported:prose'],
    importance: c.importance,
  }));
  const idIndex = new Map<string, number>();
  value.concepts.forEach((c, i) => idIndex.set(c.id, i));
  const edges: StagedGraph['edges'] = [];
  for (const e of value.edges) {
    const s = idIndex.get(e.source);
    const t = idIndex.get(e.target);
    if (s === undefined || t === undefined) continue;
    edges.push({
      sourceIndex: s,
      targetIndex: t,
      kind: 'related',
      ...(e.label ? { label: e.label } : {}),
    });
  }
  return { nodes, edges };
}

function trimTo(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}
