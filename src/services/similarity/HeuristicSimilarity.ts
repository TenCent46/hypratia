import type { CanvasNode, ID } from '../../types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to',
  'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it',
  'its', 'i', 'you', 'he', 'she', 'we', 'they', 'them', 'us', 'me', 'my',
  'your', 'our', 'their', 'so', 'not', 'no', 'do', 'does', 'did', 'have',
  'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'about', 'into', 'over', 'under', 'than', 'just',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[`*_~#>[\]()!?.,:;"']+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

type Vec = Map<string, number>;

function termFreq(words: string[]): Vec {
  const v: Vec = new Map();
  for (const w of words) v.set(w, (v.get(w) ?? 0) + 1);
  return v;
}

function tfidf(corpus: { id: ID; words: string[] }[]): Map<ID, Vec> {
  const df = new Map<string, number>();
  const tfs = new Map<ID, Vec>();
  for (const doc of corpus) {
    const tf = termFreq(doc.words);
    tfs.set(doc.id, tf);
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const N = corpus.length || 1;
  const out = new Map<ID, Vec>();
  for (const [id, tf] of tfs) {
    const vec: Vec = new Map();
    for (const [term, freq] of tf) {
      const idf = Math.log(1 + N / (df.get(term) ?? 1));
      vec.set(term, freq * idf);
    }
    out.set(id, vec);
  }
  return out;
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) {
    const u = b.get(k);
    if (u !== undefined) dot += v * u;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type Suggestion = { nodeId: ID; score: number };

export type SimilarityOptions = {
  topK?: number;
  threshold?: number;
  minContentLen?: number;
};

export function suggestRelated(
  nodeId: ID,
  allNodes: CanvasNode[],
  opts: SimilarityOptions = {},
): Suggestion[] {
  const topK = opts.topK ?? 5;
  const threshold = opts.threshold ?? 0.15;
  const minContentLen = opts.minContentLen ?? 30;

  const target = allNodes.find((n) => n.id === nodeId);
  if (!target) return [];
  if (target.contentMarkdown.length < minContentLen) return [];

  const corpus = allNodes
    .filter((n) => n.contentMarkdown.length >= minContentLen)
    .map((n) => ({
      id: n.id,
      words: [
        ...tokens(n.title),
        ...tokens(n.title), // title weighted 2×
        ...tokens(n.contentMarkdown),
      ],
    }));

  if (corpus.length < 2) return [];

  const vectors = tfidf(corpus);
  const targetVec = vectors.get(nodeId);
  if (!targetVec) return [];

  const targetTags = new Set(target.tags);
  const targetTitleTokens = new Set(tokens(target.title));

  const scored: Suggestion[] = [];
  for (const node of allNodes) {
    if (node.id === nodeId) continue;
    const v = vectors.get(node.id);
    if (!v) continue;
    let score = cosine(targetVec, v);
    const sharedTags = node.tags.filter((t) => targetTags.has(t)).length;
    score += sharedTags * 0.1;
    const sharedTitleTokens = tokens(node.title).filter((t) =>
      targetTitleTokens.has(t),
    ).length;
    score += sharedTitleTokens * 0.05;
    if (score >= threshold) scored.push({ nodeId: node.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
