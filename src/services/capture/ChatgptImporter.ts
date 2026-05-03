/**
 * Plan 43 — read OpenAI ChatGPT export (`conversations.json`) and convert
 * each conversation into the format Hypratia's Capture pipeline already
 * understands.
 *
 * v1.2 accepts the raw `.json` only (no zip extraction). Zip support is
 * deferred to v1.3 because it requires a JS unzip dep — not load-bearing
 * for the wedge.
 */

export type ImportedTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type ImportedConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  turns: ImportedTurn[];
};

type RawMessageNode = {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: {
    id?: string;
    author?: { role?: string; name?: string | null; metadata?: unknown };
    content?: { content_type?: string; parts?: unknown[] };
    create_time?: number | null;
    metadata?: { model_slug?: string };
  } | null;
};

type RawConversation = {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number;
  update_time?: number;
  mapping?: Record<string, RawMessageNode>;
  current_node?: string;
  default_model_slug?: string;
};

export function parseChatgptExport(jsonText: string): ImportedConversation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed)
    ? (parsed as RawConversation[])
    : Array.isArray((parsed as { conversations?: unknown[] }).conversations)
    ? ((parsed as { conversations: RawConversation[] }).conversations)
    : [parsed as RawConversation];
  const out: ImportedConversation[] = [];
  for (const raw of arr) {
    const conv = normalizeConversation(raw);
    if (conv) out.push(conv);
  }
  // Most-recent first.
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

function normalizeConversation(raw: RawConversation): ImportedConversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw.conversation_id ?? '';
  const mapping = raw.mapping ?? {};
  const turns: ImportedTurn[] = [];

  // Walk the parent→child chain from the root to `current_node` (or, if
  // missing, just iterate every message node in order — we emit a flat list
  // of user/assistant turns).
  const ordered: RawMessageNode[] = [];
  if (typeof raw.current_node === 'string' && mapping[raw.current_node]) {
    // Walk back to the root via parent pointers, then reverse.
    const chain: RawMessageNode[] = [];
    let cur: string | null | undefined = raw.current_node;
    const seen = new Set<string>();
    while (cur && mapping[cur] && !seen.has(cur)) {
      seen.add(cur);
      chain.push(mapping[cur]);
      cur = mapping[cur].parent ?? null;
    }
    chain.reverse();
    ordered.push(...chain);
  } else {
    for (const node of Object.values(mapping)) ordered.push(node);
  }

  for (const node of ordered) {
    const m = node.message;
    if (!m || !m.author?.role) continue;
    const role = m.author.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
    const parts = Array.isArray(m.content?.parts) ? m.content!.parts : [];
    const text = parts
      .map((p) => (typeof p === 'string' ? p : ''))
      .join('\n')
      .trim();
    if (!text) continue;
    turns.push({
      role,
      content: text,
      createdAt:
        typeof m.create_time === 'number'
          ? new Date(m.create_time * 1000).toISOString()
          : '',
    });
  }

  if (turns.length === 0) return null;
  const createdAt =
    typeof raw.create_time === 'number'
      ? new Date(raw.create_time * 1000).toISOString()
      : turns[0]?.createdAt ?? '';
  const updatedAt =
    typeof raw.update_time === 'number'
      ? new Date(raw.update_time * 1000).toISOString()
      : turns[turns.length - 1]?.createdAt ?? createdAt;

  return {
    id: id || `chatgpt_${createdAt || Date.now()}`,
    title: (raw.title ?? '').trim() || 'Untitled conversation',
    createdAt,
    updatedAt,
    model: raw.default_model_slug,
    turns,
  };
}

/**
 * Render a ChatGPT conversation back to plain text using the role markers
 * the Distiller expects (`**You:**` / `**ChatGPT:**`). The output is fed
 * directly into the Capture Preview pipeline.
 */
export function conversationToCaptureText(c: ImportedConversation): string {
  const lines: string[] = [`# ${c.title}`, ''];
  for (const t of c.turns) {
    const marker =
      t.role === 'user'
        ? '**You:**'
        : t.role === 'assistant'
        ? '**ChatGPT:**'
        : '**System:**';
    lines.push(marker);
    lines.push('');
    lines.push(t.content);
    lines.push('');
  }
  return lines.join('\n');
}
