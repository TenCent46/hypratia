/**
 * Plan 44 — Distill L1: local heuristics.
 *
 * Pure-function pipeline that turns parsed conversation turns into candidate
 * canvas nodes (decisions / tasks / questions / claims / sources) without
 * any LLM call. The high-leverage cases come from Markdown structure:
 * headings, `- [ ]` bullets, trailing `?`, citation patterns, fenced code.
 */

import type { ParsedTurn } from './PasteCapture';

export type DistillKind =
  | 'decision'
  | 'task'
  | 'question'
  | 'claim'
  | 'source';

export type DistillCandidate = {
  id: string;
  kind: DistillKind;
  title: string;
  body: string;
  sourceTurnIndex: number;
  /** 0..1; higher = more confident this is a worthwhile node. */
  confidence: number;
};

const MAX_CANDIDATES_PER_CONVERSATION = 30;

/**
 * Locale-keyed phrase tables. Order matters — earlier patterns win when
 * multiple match the same line, so the *more specific* kinds (decision,
 * task, question) are listed before the catch-all (claim).
 */
const KEYWORD_RULES: {
  kind: DistillKind;
  test: RegExp;
  confidence: number;
}[] = [
  // --- Decisions ---
  {
    kind: 'decision',
    test:
      /^\s*(?:#{2,4}\s+)?(?:Decision|Conclusion|Resolution|決定|結論)\b\s*[:.-]?/i,
    confidence: 0.92,
  },
  {
    kind: 'decision',
    test:
      /^\s*(?:we|i)\s+(?:will|'ll|are\s+going\s+to|decided\s+to|chose\s+to|go\s+with)\b/i,
    confidence: 0.7,
  },
  // --- Tasks ---
  {
    kind: 'task',
    test:
      /^\s*(?:#{2,4}\s+)?(?:Action\s+items?|Next\s+steps?|Steps?|TODO|やること|タスク)\b\s*[:.-]?/i,
    confidence: 0.9,
  },
  // --- Questions ---
  {
    kind: 'question',
    test:
      /^\s*(?:#{2,4}\s+)?(?:Open\s+questions?|Questions?|未解決|問い)\b\s*[:.-]?/i,
    confidence: 0.88,
  },
];

let counter = 0;
function newCandidateId(): string {
  counter += 1;
  return `cand_${Date.now().toString(36)}_${counter.toString(36)}`;
}

const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;
const CITATION_RE = /\[\d+\](?!\()|\[Source[^\]]*\]/gi;

function trimTitle(s: string, max = 60): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function stripMarkdownLeader(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .trim();
}

/**
 * Walk a turn line by line, recognizing Markdown structure (headings, bullets,
 * code fences, blockquotes) so we can attribute each line to the right kind.
 */
function distillTurn(turn: ParsedTurn): DistillCandidate[] {
  const candidates: DistillCandidate[] = [];
  if (turn.role !== 'assistant' && turn.role !== 'user') return candidates;
  const lines = turn.content.split('\n');

  let inFence = false;
  /** Headings on the stack — used so bullets land under their parent kind. */
  let activeHeadingKind: DistillKind | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim()) continue;
    if (line.trim().startsWith('>')) continue; // blockquote — skip

    // Headings
    if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      const matched = matchKeywordKind(line);
      activeHeadingKind = matched ? matched.kind : null;
      const titleText = stripMarkdownLeader(line);
      // H2/H3 without other classification → claim.
      const kind: DistillKind = matched ? matched.kind : 'claim';
      const conf = matched ? matched.confidence : 0.55;
      candidates.push({
        id: newCandidateId(),
        kind,
        title: trimTitle(titleText),
        body: titleText,
        sourceTurnIndex: turn.index,
        confidence: conf,
      });
      continue;
    }

    // Task checkbox — most specific bullet form.
    const checkbox = line.match(/^\s*[-*+]\s+\[[ xX]\]\s+(.+)$/);
    if (checkbox) {
      candidates.push({
        id: newCandidateId(),
        kind: 'task',
        title: trimTitle(checkbox[1]),
        body: checkbox[1].trim(),
        sourceTurnIndex: turn.index,
        confidence: 0.92,
      });
      continue;
    }

    // Bullet under an active heading-kind: inherit the parent kind.
    if (activeHeadingKind && /^\s{0,8}[-*+]\s+\S/.test(line)) {
      const text = stripMarkdownLeader(line);
      if (text.length > 0) {
        candidates.push({
          id: newCandidateId(),
          kind: activeHeadingKind,
          title: trimTitle(text),
          body: text,
          sourceTurnIndex: turn.index,
          confidence: 0.78,
        });
        continue;
      }
    }

    // Trailing-question lines (assistant turns only — user turns are
    // questions by nature; we don't want every user prompt to become a
    // candidate question).
    if (turn.role === 'assistant' && /\?\s*$/.test(line)) {
      const text = stripMarkdownLeader(line);
      candidates.push({
        id: newCandidateId(),
        kind: 'question',
        title: trimTitle(text),
        body: text,
        sourceTurnIndex: turn.index,
        confidence: 0.65,
      });
      continue;
    }

    // Sentences starting with an explicit decision verb.
    const decision = matchKeywordKind(line);
    if (decision && decision.kind === 'decision') {
      candidates.push({
        id: newCandidateId(),
        kind: 'decision',
        title: trimTitle(line),
        body: line,
        sourceTurnIndex: turn.index,
        confidence: decision.confidence,
      });
      continue;
    }
  }

  // URLs and citations from the whole turn.
  const urls = (turn.content.match(URL_RE) ?? []).slice(0, 8);
  for (const url of urls) {
    candidates.push({
      id: newCandidateId(),
      kind: 'source',
      title: trimTitle(url, 80),
      body: url,
      sourceTurnIndex: turn.index,
      confidence: 0.7,
    });
  }
  const citations = (turn.content.match(CITATION_RE) ?? []).slice(0, 6);
  for (const cite of citations) {
    candidates.push({
      id: newCandidateId(),
      kind: 'source',
      title: trimTitle(cite, 40),
      body: cite,
      sourceTurnIndex: turn.index,
      confidence: 0.5,
    });
  }

  return candidates;
}

function matchKeywordKind(
  line: string,
): { kind: DistillKind; confidence: number } | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(line)) {
      return { kind: rule.kind, confidence: rule.confidence };
    }
  }
  return null;
}

/** Levenshtein-style distance, normalized to [0, 1]. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  const max = Math.max(la, lb);
  if (max === 0) return 1;
  // Cheap shortcut: substring containment.
  if (a.length > 8 && b.includes(a)) return 0.9;
  if (b.length > 8 && a.includes(b)) return 0.9;
  // Otherwise, jaccard-of-bigrams (fast, good enough for dedup).
  const bigrams = (s: string) => {
    const out = new Set<string>();
    const norm = s.toLowerCase().replace(/\s+/g, ' ').trim();
    for (let i = 0; i < norm.length - 1; i += 1) out.add(norm.slice(i, i + 2));
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const v of A) if (B.has(v)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function dedup(candidates: DistillCandidate[]): DistillCandidate[] {
  const out: DistillCandidate[] = [];
  for (const c of candidates) {
    let merged = false;
    for (const k of out) {
      if (k.kind !== c.kind) continue;
      if (similarity(k.title, c.title) >= 0.85) {
        // Keep the higher-confidence one.
        if (c.confidence > k.confidence) {
          k.title = c.title;
          k.body = c.body;
          k.confidence = c.confidence;
        }
        merged = true;
        break;
      }
    }
    if (!merged) out.push(c);
  }
  return out;
}

export function distillLocal(turns: ParsedTurn[]): DistillCandidate[] {
  const all: DistillCandidate[] = [];
  for (const t of turns) {
    for (const c of distillTurn(t)) all.push(c);
  }
  // Sort within each kind by (confidence desc, sourceTurnIndex desc — later
  // turns are usually the synthesis), then merge cross-kind ordering.
  all.sort((a, b) => {
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return b.sourceTurnIndex - a.sourceTurnIndex;
  });
  const deduped = dedup(all);
  if (deduped.length > MAX_CANDIDATES_PER_CONVERSATION) {
    return deduped.slice(0, MAX_CANDIDATES_PER_CONVERSATION);
  }
  return deduped;
}
