import { MockSummarizer } from './MockSummarizer';
import type { Summarizer } from './Summarizer';

let active: Summarizer = new MockSummarizer();

export function getSummarizer(): Summarizer {
  return active;
}

export function setSummarizer(s: Summarizer): void {
  active = s;
}

export type { Summarizer, SummaryResult } from './Summarizer';
