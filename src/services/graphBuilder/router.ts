import { llmComplete, runChain } from './modelChain';
import type { ChainTier, GraphInputKind } from './types';

const ROUTE_SYSTEM = [
  'You decide whether the user has pasted a chat / conversation transcript or a piece of prose.',
  'Reply with exactly one word: "conversation" or "prose". No punctuation, no quotes.',
].join(' ');

const SAMPLE_LEN = 4000;

export async function routeInput(
  text: string,
  chain: ChainTier[],
  signal?: AbortSignal,
): Promise<{ kind: GraphInputKind; modelUsed: ChainTier }> {
  const sample = text.slice(0, SAMPLE_LEN);
  const { value, modelUsed } = await runChain<GraphInputKind>(
    chain,
    async (model, sig) => {
      const out = await llmComplete(
        model,
        ROUTE_SYSTEM,
        `INPUT (truncated to ${SAMPLE_LEN} chars):\n${sample}`,
        sig,
      );
      const cleaned = out.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (cleaned.startsWith('conv')) return 'conversation';
      if (cleaned.startsWith('prose')) return 'prose';
      return null;
    },
    () => routeHeuristically(text),
    signal,
  );
  return { kind: value, modelUsed };
}

/**
 * Count distinct user-turn markers. Three or more → looks like a chat.
 * Markers cover English ("user:", "human:", "me:", "Q:") and Japanese
 * ("あなた:", "私:", "Q:"). Any marker that introduces a new line
 * counts.
 */
export function routeHeuristically(text: string): GraphInputKind {
  const re = /(?:^|\n)\s*(user|human|me|q|あなた|私)\s*[:>]/gi;
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    seen.add(m.index);
    if (seen.size >= 3) return 'conversation';
  }
  return 'prose';
}
