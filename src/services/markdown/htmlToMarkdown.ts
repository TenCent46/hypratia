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
  // GFM tables — turndown's defaults emit nothing for <table> / <tr> / <td>,
  // so an HTML table copied from a webpage paste-collapses into a stream of
  // cell text. Convert it back into a real GFM pipe table so the canvas
  // markdown renderer can show it as a bordered grid.
  td.addRule('gfmTable', {
    filter: 'table',
    replacement: (_content, node) => {
      const el = node as HTMLTableElement;
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const cells: string[][] = rows.map((row) =>
        Array.from(row.querySelectorAll('th, td')).map((cell) =>
          (cell.textContent ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\|/g, '\\|')
            .trim(),
        ),
      );
      const colCount = cells.reduce((m, r) => Math.max(m, r.length), 0);
      if (colCount === 0) return '';
      const padded = cells.map((r) => {
        const out = r.slice();
        while (out.length < colCount) out.push('');
        return out;
      });
      // Use the first row as the header (whether or not <thead> exists);
      // GFM tables require a header + separator. If the source had no
      // header row this misclassifies the first body row, but that's far
      // less destructive than dropping the table entirely.
      const [header, ...body] = padded;
      const sep = Array(colCount).fill('---');
      const lines = [
        `| ${header.join(' | ')} |`,
        `| ${sep.join(' | ')} |`,
        ...body.map((r) => `| ${r.join(' | ')} |`),
      ];
      return `\n\n${lines.join('\n')}\n\n`;
    },
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
