import type { Message, ModelRef } from '../../types';
import type { Summarizer, SummaryResult } from '../summarize/Summarizer';
import { chat } from './index';

const SYSTEM = `You are a concise note-taking assistant. Produce a Markdown summary of the conversation:
- Title line: "Summary: <few-word headline>"
- Then 3 to 6 bullet points, each starting with a strong verb.
- No preamble.`;

export class RealSummarizer implements Summarizer {
  constructor(private model: ModelRef) {}

  name(): string {
    return `${this.model.provider}/${this.model.model}`;
  }

  async summarize(messages: Message[]): Promise<SummaryResult> {
    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    const result = await chat.complete({
      provider: this.model.provider,
      model: this.model.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      maxTokens: 400,
    });
    const lines = result.text.split('\n').map((l) => l.trim());
    const titleLine = lines.find((l) => l.startsWith('Summary:')) ?? '';
    const title = titleLine.replace(/^Summary:\s*/i, '').trim() || 'Summary';
    const body = result.text;
    return {
      title: `Summary: ${title}`,
      contentMarkdown: body,
      isMock: false,
    };
  }
}
