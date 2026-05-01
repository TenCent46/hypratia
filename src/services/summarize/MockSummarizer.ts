import type { Message } from '../../types';
import type { Summarizer, SummaryResult } from './Summarizer';

function firstWords(text: string, n: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}

function clip(text: string, n: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export class MockSummarizer implements Summarizer {
  name(): string {
    return 'mock';
  }

  async summarize(messages: Message[]): Promise<SummaryResult> {
    const userMsgs = messages.filter((m) => m.role === 'user');
    const seed = userMsgs[0]?.content ?? messages[0]?.content ?? '';
    const title = `Summary: ${firstWords(seed, 6) || 'untitled'}`;
    const bullets = messages
      .slice(0, 5)
      .map((m) => `- **${m.role}** — ${clip(m.content, 140)}`)
      .join('\n');
    const body =
      `*(mock summary — no LLM was called)*\n\n` +
      (bullets || '_(empty conversation)_');
    return { title, contentMarkdown: body, isMock: true };
  }
}
