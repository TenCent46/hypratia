import type { Message } from '../../types';

export type SummaryResult = {
  title: string;
  contentMarkdown: string;
  isMock?: boolean;
};

export interface Summarizer {
  name(): string;
  summarize(messages: Message[]): Promise<SummaryResult>;
}
