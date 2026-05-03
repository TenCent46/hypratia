/**
 * Plan 51 — Laconic View, local compressor.
 *
 * Pure-function pipeline that strips boilerplate / hedging / decorative
 * phrasing from an AI message while preserving meaning. The original
 * message content is *never* overwritten — this just produces a derived
 * view text.
 *
 * Tagline: *Laconic View turns verbose AI answers into reusable thought.*
 *
 * Locale: English + Japanese seed boilerplate sets ship in v1.2.
 */

export const LACONIC_PROMPT_VERSION = '2026-05-02-1';

/** Lines that are *only* boilerplate openers / closers — drop entire line. */
const FULL_LINE_BOILERPLATE: RegExp[] = [
  /^\s*(?:great|good|excellent|interesting|fantastic|nice)\s+(?:question|point|catch)[!.\s]*$/i,
  /^\s*(?:happy|glad)\s+to\s+help[!.\s]*$/i,
  /^\s*let\s+me\s+(?:think|elaborate|explain|break\s+(?:this|it)\s+down)[!.\s]*$/i,
  /^\s*(?:let\s+me\s+know|feel\s+free\s+to\s+ask)\b.*$/i,
  /^\s*(?:hope\s+(?:this|that)\s+helps|i\s+hope\s+this\s+helps)\b.*$/i,
  /^\s*(?:in\s+summary|to\s+summarize|to\s+sum\s+up|in\s+conclusion)[:,]\s*$/i,
  /^\s*(?:結論から(?:言うと|申し上げると)|要するに|つまり)\s*[:、,]\s*$/,
  /^\s*(?:お(?:役|やく)に立てれば(?:幸い|嬉しい)です)[!。.\s]*$/,
];

/** Phrases that, when prefixing a sentence, are stripped (rest of sentence kept). */
const SENTENCE_PREFIX_BOILERPLATE: RegExp[] = [
  /^\s*(?:great|good|excellent)\s+(?:question|point)[!.,]?\s+/i,
  /^\s*(?:absolutely|of\s+course|certainly|sure)[!.,]?\s+/i,
  /^\s*(?:in\s+other\s+words|put\s+another\s+way|to\s+be\s+clear)[:,]?\s+/i,
  /^\s*(?:that(?:'s|\s+is)\s+a\s+(?:great|good|fascinating)\s+(?:question|point))[!.,]?\s+/i,
  /^\s*(?:結論から(?:言うと|申し上げると))[:、,]?\s*/,
  /^\s*(?:重要なのは)[:、,]?\s*/,
];

/** "however / additionally / moreover" linking that adds no information. */
const FILLER_INLINE: RegExp[] = [
  /\b(?:however|that\s+said|having\s+said\s+that)[,]\s+/gi,
  /\b(?:furthermore|moreover|additionally|in\s+addition)[,]\s+/gi,
  /\bof\s+course[,]\s+/gi,
];

/** Repeated "つまり / まとめると" Japanese fillers. */
const JA_FILLER_INLINE: RegExp[] = [/(?:^|、)\s*(?:つまり|要するに|まとめると)\s*[、,]?/g];

/**
 * Compress `content` by removing boilerplate lines / phrases. Code fences,
 * blockquotes, headings, lists, links, numbers, and named entities pass
 * through verbatim. The output is *not* a summary — it is the same
 * structure with thinner prose.
 */
export function compressLaconicLocally(
  content: string,
  locale: 'en' | 'ja' = 'en',
): string {
  if (!content.trim()) return content;

  const lines = content.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence) {
      out.push(raw);
      continue;
    }
    // Headings, blockquotes, list items, table separators — keep verbatim.
    if (/^\s{0,3}(?:#{1,6}\s|>|\||[-*+]\s|\d+[.)]\s)/.test(raw)) {
      out.push(raw);
      continue;
    }
    // Drop pure boilerplate lines.
    if (FULL_LINE_BOILERPLATE.some((re) => re.test(raw))) {
      continue;
    }
    let line = raw;
    for (const re of SENTENCE_PREFIX_BOILERPLATE) {
      line = line.replace(re, '');
    }
    for (const re of FILLER_INLINE) {
      line = line.replace(re, '');
    }
    if (locale === 'ja') {
      for (const re of JA_FILLER_INLINE) {
        line = line.replace(re, '');
      }
    }
    // Trim doubled whitespace caused by removals; preserve leading indent.
    const leading = line.match(/^\s*/)?.[0] ?? '';
    line = leading + line.slice(leading.length).replace(/\s{2,}/g, ' ');
    out.push(line);
  }

  // Collapse > 1 consecutive blank lines.
  const compact: string[] = [];
  let blanks = 0;
  for (const l of out) {
    if (l.trim() === '') {
      blanks += 1;
      if (blanks <= 1) compact.push(l);
    } else {
      blanks = 0;
      compact.push(l);
    }
  }

  // Trim leading/trailing blank lines but keep the original content's
  // single-line / multi-line shape.
  let start = 0;
  let end = compact.length;
  while (start < end && compact[start].trim() === '') start += 1;
  while (end > start && compact[end - 1].trim() === '') end -= 1;
  return compact.slice(start, end).join('\n');
}

/**
 * Cheap content hash. Not cryptographic — just a stable cache key. djb2.
 */
export function contentHash(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i += 1) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Persist a freshly-generated laconic view to the per-message sidecar so
 * the compressed text travels with the vault (and survives a Hypratia
 * reinstall). When `vaultPath` is falsy (no vault configured), we no-op
 * gracefully — Laconic still works in-memory through the message store.
 *
 * Calls into `services/storage/SidecarFs` so the `@tauri-apps/*` import
 * stays inside the architectural allowlist.
 */
export async function persistLaconicToSidecar(opts: {
  messageId: string;
  conversationId: string;
  laconic: { text: string; promptVersion: string; generatedAt: string };
  contentHash: string;
  vaultPath: string | undefined;
}): Promise<void> {
  if (!opts.vaultPath) return;
  // Lazy import keeps the laconic module tree-shake-friendly for the
  // demo build (which doesn't ship Tauri's fs plugin).
  const { mergeSidecarPatch } = await import('../storage/SidecarFs');
  await mergeSidecarPatch(
    opts.messageId,
    {
      source_conversation_id: opts.conversationId,
      source_message_id: opts.messageId,
      original_text_hash: opts.contentHash,
      laconic_view: {
        text: opts.laconic.text,
        engine: 'local',
        prompt_version: opts.laconic.promptVersion,
        generated_at: opts.laconic.generatedAt,
      },
      last_distilled_at: new Date().toISOString(),
    },
    opts.vaultPath,
  );
}
