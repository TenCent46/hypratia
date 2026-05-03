/**
 * Plan 41 — Paste-to-Canvas: detect whether pasted text looks like an AI
 * conversation (ChatGPT / Claude) and, if so, parse it into role-attributed
 * turns. Pure logic; no DOM, no network. The Distiller (plan 44) consumes
 * `ParsedTurn[]`.
 */

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

const ROLE_MARKERS: { re: RegExp; role: ParsedTurn['role'] }[] = [
  // Primary patterns — start of line, with bold or plain markers.
  { re: /^\s*\*\*\s*(?:You|User)\s*:\s*\*\*\s*/im, role: 'user' },
  {
    re: /^\s*\*\*\s*(?:ChatGPT|Assistant|Claude|GPT|AI)\s*:\s*\*\*\s*/im,
    role: 'assistant',
  },
  { re: /^\s*(?:You|User)\s*:\s+/im, role: 'user' },
  { re: /^\s*(?:ChatGPT|Assistant|Claude|GPT|AI)\s*:\s+/im, role: 'assistant' },
  // Japanese variants (ChatGPT 日本語 UI export).
  { re: /^\s*\*\*\s*(?:あなた|ユーザー)\s*:\s*\*\*\s*/im, role: 'user' },
  {
    re: /^\s*\*\*\s*(?:アシスタント|ChatGPT)\s*:\s*\*\*\s*/im,
    role: 'assistant',
  },
];

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
  let hits = 0;
  for (const { re } of ROLE_MARKERS) {
    if (re.test(text)) hits += 1;
  }
  // Markdown signal: at least three H2/H3 headings with a blank line follow.
  const headingHits = (text.match(/^\s{0,3}#{2,3}\s+\S/gm) ?? []).length;
  // Multi-turn signal: at least two distinct role markers anywhere in the
  // text (regardless of bold).
  const userMarks = (text.match(/^\s*(?:You|User|あなた|ユーザー)\s*:\s+/gim) ?? [])
    .length;
  const asstMarks = (
    text.match(/^\s*(?:ChatGPT|Assistant|Claude|GPT|AI|アシスタント)\s*:\s+/gim) ?? []
  ).length;
  const multiTurn = userMarks > 0 && asstMarks > 0;

  let confidence = 0;
  if (multiTurn) confidence += 0.55;
  if (hits >= 2) confidence += 0.2;
  if (headingHits >= 3) confidence += 0.15;
  if (text.length > 800) confidence += 0.1;
  confidence = Math.min(1, confidence);

  let format: ConversationFormat = 'plain';
  if (multiTurn) {
    format = /Claude|アシスタント\b/i.test(text)
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
  // Reuse the same markers but as global, multi-line.
  const patterns: { re: RegExp; role: ParsedTurn['role'] }[] = [
    { re: /^\s*\*\*\s*(?:You|User|あなた|ユーザー)\s*:\s*\*\*\s*/gim, role: 'user' },
    {
      re: /^\s*\*\*\s*(?:ChatGPT|Assistant|Claude|GPT|AI|アシスタント)\s*:\s*\*\*\s*/gim,
      role: 'assistant',
    },
    { re: /^\s*(?:You|User|あなた|ユーザー)\s*:\s+/gim, role: 'user' },
    {
      re: /^\s*(?:ChatGPT|Assistant|Claude|GPT|AI|アシスタント)\s*:\s+/gim,
      role: 'assistant',
    },
  ];
  for (const { re, role } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      hits.push({ index: m.index, length: m[0].length, role });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  // Dedup overlapping markers (e.g. bold + plain caught the same line).
  const out: RoleHit[] = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && h.index < prev.index + prev.length) continue;
    out.push(h);
  }
  return out;
}

/**
 * Split pasted text into role-attributed turns. When the text has no role
 * markers at all (plain Markdown-style content), it returns a single
 * `assistant` turn so the distiller still has something to work with.
 *
 * The first heading in the content (if any) becomes the conversation title.
 */
export function parsePastedConversation(text: string): ParsedConversation {
  const trimmed = text.trim();
  const titleFromHeading = trimmed.match(/^\s{0,3}#\s+(.+)$/m)?.[1]?.trim();
  const title = (titleFromHeading || firstNonEmptyLine(trimmed) || 'Pasted conversation')
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  const hits = findRoleHits(trimmed);
  if (hits.length === 0) {
    return {
      title,
      turns: [{ role: 'assistant', content: trimmed, index: 0 }],
    };
  }
  const turns: ParsedTurn[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].index + hits[i].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : trimmed.length;
    const content = trimmed.slice(start, end).trim();
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
