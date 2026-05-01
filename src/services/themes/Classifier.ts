import { chat } from '../llm';
import type {
  CanvasNode,
  ID,
  ModelRef,
  ThemeKind,
} from '../../types';

export type ClassifyInput = {
  conversationId: ID;
  message: string;
  /** Recent theme roots in the same conversation; oldest first. */
  recentThemes: Pick<
    CanvasNode,
    'id' | 'title' | 'contentMarkdown' | 'tags'
  >[];
  model?: ModelRef;
};

export type ClassifyOutput = {
  /**
   * Existing theme node id this ask attaches to, or `null` to mint a new
   * theme root from `themeTitle`.
   */
  themeId: ID | null;
  isNew: boolean;
  themeTitle: string;
  askSummary: string;
  themeKind: ThemeKind;
  importance: 1 | 2 | 3 | 4 | 5;
};

export interface Classifier {
  classify(input: ClassifyInput): Promise<ClassifyOutput>;
}

const ASK_SUMMARY_LEN = 80;
const THEME_TITLE_LEN = 60;

function trimTo(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function sentenceCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class HeuristicClassifier implements Classifier {
  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const summary = trimTo(input.message, ASK_SUMMARY_LEN);
    const recent = input.recentThemes.filter((n) =>
      (n.tags ?? []).includes('themeKind:theme'),
    );
    const last = recent[recent.length - 1];
    if (!last) {
      return {
        themeId: null,
        isNew: true,
        themeTitle: sentenceCase(trimTo(input.message, THEME_TITLE_LEN)),
        askSummary: summary,
        themeKind: 'ask',
        importance: 3,
      };
    }
    return {
      themeId: last.id,
      isNew: false,
      themeTitle: last.title,
      askSummary: summary,
      themeKind: 'ask',
      importance: 3,
    };
  }
}

const SYSTEM_PROMPT = [
  'You classify a user chat message into a conversation-map node.',
  'Reply with JSON only — no prose, no code fence.',
  'Schema:',
  '{',
  '  "themeId": string|null,        // id of an existing theme this attaches to; null to start a new theme',
  '  "isNew": boolean,              // true iff themeId is null and a new theme should be created',
  '  "themeTitle": string,          // <= 60 chars, sentence-case, descriptive of the theme cluster',
  '  "askSummary": string,          // <= 80 chars, single line, paraphrase of the user ask',
  '  "themeKind": "ask",            // always "ask" for user messages',
  '  "importance": 1|2|3|4|5         // 3 default; bump for explicit asks for decisions/comparisons',
  '}',
].join('\n');

export class LLMClassifier implements Classifier {
  constructor(private readonly model: ModelRef) {}

  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const fallback: ClassifyOutput = await new HeuristicClassifier().classify(input);
    const recentThemesBrief = input.recentThemes
      .filter((n) => (n.tags ?? []).includes('themeKind:theme'))
      .slice(-8)
      .map((n) => `- id=${n.id} :: ${trimTo(n.title, 60)}`)
      .join('\n');
    const userPrompt = [
      'New user message:',
      input.message,
      '',
      'Recent themes in this conversation (most recent last):',
      recentThemesBrief || '(none)',
      '',
      'Return the JSON now.',
    ].join('\n');
    try {
      const result = await chat.complete({
        provider: this.model.provider,
        model: this.model.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
      });
      const parsed = parseJsonLoose(result.text);
      if (!parsed) return fallback;
      return normalizeOutput(parsed, fallback);
    } catch {
      return fallback;
    }
  }
}

function parseJsonLoose(raw: string): unknown {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Strip ```json fences if the model added them despite instructions.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Last-resort: extract the first {...} block.
    const open = body.indexOf('{');
    const close = body.lastIndexOf('}');
    if (open >= 0 && close > open) {
      try {
        return JSON.parse(body.slice(open, close + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeOutput(
  raw: unknown,
  fallback: ClassifyOutput,
): ClassifyOutput {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const themeId =
    typeof obj.themeId === 'string' && obj.themeId.length > 0
      ? obj.themeId
      : null;
  const isNew = themeId === null ? true : Boolean(obj.isNew);
  const themeTitle = typeof obj.themeTitle === 'string'
    ? trimTo(sentenceCase(obj.themeTitle), THEME_TITLE_LEN)
    : fallback.themeTitle;
  const askSummary = typeof obj.askSummary === 'string'
    ? trimTo(obj.askSummary, ASK_SUMMARY_LEN)
    : fallback.askSummary;
  const themeKindRaw = obj.themeKind;
  const themeKind: ThemeKind =
    themeKindRaw === 'theme' ||
    themeKindRaw === 'ask' ||
    themeKindRaw === 'insight' ||
    themeKindRaw === 'decision'
      ? themeKindRaw
      : 'ask';
  const importanceRaw = Number(obj.importance);
  const importance: 1 | 2 | 3 | 4 | 5 =
    importanceRaw >= 1 && importanceRaw <= 5
      ? (Math.round(importanceRaw) as 1 | 2 | 3 | 4 | 5)
      : 3;
  return { themeId, isNew, themeTitle, askSummary, themeKind, importance };
}
