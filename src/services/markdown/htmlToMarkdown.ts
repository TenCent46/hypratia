import type TurndownServiceType from 'turndown';

let cached: TurndownServiceType | null = null;

async function getService(): Promise<TurndownServiceType> {
  if (cached) return cached;
  const { default: TurndownService } = await import('turndown');
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  // Strikethrough — common in AI outputs but not in turndown's default rules.
  td.addRule('strikethrough', {
    filter: ['del', 's'] as unknown as TurndownServiceType.Filter,
    replacement: (content) => `~~${content}~~`,
  });
  // Task list checkboxes — drop them through, GitHub-flavored.
  td.addRule('taskListItem', {
    filter: (node) =>
      node.nodeName === 'LI' &&
      (node as HTMLElement).querySelector(
        ':scope > input[type="checkbox"]',
      ) !== null,
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const input = el.querySelector(
        ':scope > input[type="checkbox"]',
      ) as HTMLInputElement | null;
      const checked = input?.checked ? 'x' : ' ';
      input?.remove();
      const text = el.textContent?.trim() ?? '';
      return `- [${checked}] ${text}\n`;
    },
  });
  cached = td;
  return cached;
}

/**
 * Convert an HTML fragment from the clipboard into Markdown. Trimmed; never
 * throws — falls back to the empty string on conversion failure so callers can
 * fall through to the browser's plain-text paste behavior.
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html.trim()) return '';
  try {
    const td = await getService();
    return td.turndown(html).trim();
  } catch (err) {
    console.warn('[htmlToMarkdown] conversion failed', err);
    return '';
  }
}
