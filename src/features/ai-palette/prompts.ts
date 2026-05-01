export type AiPreset = {
  id: string;
  label: string;
  build: (selection: string) => string;
};

const clip = (s: string, n = 4000) =>
  s.length > n ? `${s.slice(0, n)}\n\n[…clipped]` : s;

export const PRESETS: AiPreset[] = [
  {
    id: 'improve',
    label: 'Improve writing',
    build: (sel) =>
      `Rewrite the following passage for clarity and tightness. Preserve meaning. Reply with only the rewritten text.\n\n---\n${clip(sel)}`,
  },
  {
    id: 'summarize',
    label: 'Summarize in 3 bullets',
    build: (sel) =>
      `Summarize the following into exactly three concise bullet points.\n\n---\n${clip(sel)}`,
  },
  {
    id: 'expand',
    label: 'Expand with examples',
    build: (sel) =>
      `Expand the following with two concrete examples and a short explanation.\n\n---\n${clip(sel)}`,
  },
  {
    id: 'extract',
    label: 'Extract key idea',
    build: (sel) =>
      `Extract the single most important idea from the following passage as a one-paragraph atom of thought.\n\n---\n${clip(sel)}`,
  },
  {
    id: 'question',
    label: 'Ask: what would you do with this?',
    build: (sel) =>
      `Read the following and reply with three sharp questions that would push my thinking further.\n\n---\n${clip(sel)}`,
  },
];
