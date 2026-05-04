/**
 * Plan 41 — Paste-to-Canvas: detect whether pasted text looks like an AI
 * conversation (ChatGPT / Claude) and, if so, parse it into role-attributed
 * turns. Pure logic; no DOM, no network. The Distiller (plan 44) consumes
 * `ParsedTurn[]`.
 *
 * Plan/v1/31 follow-up: the marker set + transcript noise stripping live in
 * {@link ./transcriptNormalize.ts} so both the Capture and GraphImport
 * paths stay in sync.
 */

import {
  ASST_MARK_PATTERNS,
  USER_MARK_PATTERNS,
  normalizeTranscript,
} from './transcriptNormalize.ts';

export type ConversationFormat =
  | 'chatgpt-share'
  | 'claude-share'
  | 'markdown'
  | 'plain';

export type ParsedTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Position in the original conversation, used for layout / source links. */
  index: number;
};

export type ParsedConversation = {
  title: string;
  turns: ParsedTurn[];
};

/**
 * Cheap structural classifier. Returns `confidence` ∈ [0, 1] and a guess at
 * the source format. Threshold for "treat as conversation" is the caller's
 * job (plan 41 uses ≥ 0.6, with `⌘⇧V` always opening the preview anyway).
 */
export function detectAIConversation(text: string): {
  confidence: number;
  format: ConversationFormat;
} {
  if (!text || text.length < 80) {
    return { confidence: 0, format: 'plain' };
  }
  const normalised = normalizeTranscript(text);
  let userMarks = 0;
  let asstMarks = 0;
  for (const re of USER_MARK_PATTERNS) {
    re.lastIndex = 0;
    userMarks += (normalised.match(re) ?? []).length;
  }
  for (const re of ASST_MARK_PATTERNS) {
    re.lastIndex = 0;
    asstMarks += (normalised.match(re) ?? []).length;
  }
  const multiTurn = userMarks > 0 && asstMarks > 0;
  const totalMarkerLines = userMarks + asstMarks;

  // Markdown signal: at least three H2/H3 headings with a blank line follow.
  const headingHits = (normalised.match(/^\s{0,3}#{2,3}\s+\S/gm) ?? []).length;

  let confidence = 0;
  if (multiTurn) confidence += 0.55;
  if (totalMarkerLines >= 4) confidence += 0.2;
  else if (totalMarkerLines >= 2) confidence += 0.1;
  if (headingHits >= 3) confidence += 0.15;
  if (normalised.length > 800) confidence += 0.1;
  confidence = Math.min(1, confidence);

  let format: ConversationFormat = 'plain';
  if (multiTurn) {
    format = /Claude\b|アシスタント\b/i.test(normalised)
      ? 'claude-share'
      : 'chatgpt-share';
  } else if (headingHits >= 3) {
    format = 'markdown';
  }
  return { confidence, format };
}

type RoleHit = { index: number; length: number; role: ParsedTurn['role'] };

function findRoleHits(text: string): RoleHit[] {
  const hits: RoleHit[] = [];
  for (const re of USER_MARK_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      hits.push({ index: m.index, length: m[0].length, role: 'user' });
    }
  }
  for (const re of ASST_MARK_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      hits.push({ index: m.index, length: m[0].length, role: 'assistant' });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  // Dedup overlapping markers (e.g. bold + plain caught the same line, or
  // the "You said:" pattern overlapping the legacy "You:" pattern).
  const out: RoleHit[] = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && h.index < prev.index + prev.length) continue;
    out.push(h);
  }
  return out;
}

/**
 * Split pasted text into role-attributed turns. The transcript is run
 * through `normalizeTranscript` first to drop Claude.ai cosmetic noise
 * (date stamps, file metadata, operation logs, consecutive duplicates)
 * so a `You said: …` block followed by file metadata still surfaces
 * the user's actual question as the user-turn body.
 *
 * When the text has no role markers at all (plain Markdown content), it
 * returns a single `assistant` turn so the distiller still has
 * something to work with.
 */
export function parsePastedConversation(text: string): ParsedConversation {
  const cleaned = normalizeTranscript(text).trim();
  const titleFromHeading = cleaned.match(/^\s{0,3}#\s+(.+)$/m)?.[1]?.trim();
  const title = (titleFromHeading || firstNonEmptyLine(cleaned) || 'Pasted conversation')
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  const hits = findRoleHits(cleaned);
  if (hits.length === 0) {
    return {
      title,
      turns: [{ role: 'assistant', content: cleaned, index: 0 }],
    };
  }
  const turns: ParsedTurn[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].index + hits[i].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : cleaned.length;
    const content = cleaned.slice(start, end).trim();
    if (!content) continue;
    turns.push({ role: hits[i].role, content, index: turns.length });
  }
  return { title, turns };
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t) return t.replace(/^#+\s+/, '');
  }
  return null;
}
