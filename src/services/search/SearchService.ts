import type {
  CanvasNode,
  Conversation,
  ID,
  Message,
} from '../../types';

export type SearchResult =
  | {
      kind: 'conversation';
      id: ID;
      title: string;
      snippet: string;
    }
  | {
      kind: 'message';
      id: ID;
      conversationId: ID;
      conversationTitle: string;
      snippet: string;
      role: Message['role'];
    }
  | {
      kind: 'node';
      id: ID;
      conversationId: ID;
      conversationTitle: string;
      title: string;
      snippet: string;
    };

function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase();
}

function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function allTokensMatch(haystack: string, tokens: string[]): boolean {
  const h = normalize(haystack);
  return tokens.every((t) => h.includes(t));
}

function snippet(text: string, tokens: string[], radius = 50): string {
  const norm = normalize(text);
  const idx = tokens
    .map((t) => norm.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (idx === undefined) return text.slice(0, 120);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export type SearchInput = {
  conversations: Conversation[];
  messages: Message[];
  nodes: CanvasNode[];
};

export function search(query: string, data: SearchInput): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const convById = new Map(data.conversations.map((c) => [c.id, c]));
  const results: SearchResult[] = [];

  for (const c of data.conversations) {
    if (allTokensMatch(c.title, tokens)) {
      results.push({
        kind: 'conversation',
        id: c.id,
        title: c.title,
        snippet: snippet(c.title, tokens),
      });
    }
  }

  for (const m of data.messages) {
    if (allTokensMatch(m.content, tokens)) {
      const conv = convById.get(m.conversationId);
      results.push({
        kind: 'message',
        id: m.id,
        conversationId: m.conversationId,
        conversationTitle: conv?.title ?? 'Unknown',
        snippet: snippet(m.content, tokens),
        role: m.role,
      });
    }
  }

  for (const n of data.nodes) {
    const haystack = `${n.title}\n${n.contentMarkdown}`;
    if (allTokensMatch(haystack, tokens)) {
      const conv = convById.get(n.conversationId);
      results.push({
        kind: 'node',
        id: n.id,
        conversationId: n.conversationId,
        conversationTitle: conv?.title ?? 'Unknown',
        title: n.title,
        snippet: snippet(haystack, tokens),
      });
    }
  }

  return results.slice(0, 50);
}

export function highlightParts(
  text: string,
  query: string,
): Array<{ text: string; match: boolean }> {
  const tokens = tokenize(query).filter((t) => t.length > 0);
  if (tokens.length === 0) return [{ text, match: false }];
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`(${escaped})`, 'gi');
  const out: Array<{ text: string; match: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), match: false });
    out.push({ text: m[0], match: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out;
}
