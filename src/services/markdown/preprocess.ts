/**
 * Pre-process markdown to convert Obsidian-style syntax that the standard
 * remark plugins don't handle natively:
 *  - `> [!note] Title` callouts → blockquote with `[callout:KIND] Title`.
 *  - `[[node-id|alias]]` wikilinks → `[alias](mc:wikilink/node-id)`.
 *  - `![[node-id]]` transclusion → `[mc-transclude:node-id](mc:transclude/node-id)`.
 */
const CALLOUT_KINDS = new Set([
  'note',
  'info',
  'tip',
  'success',
  'warning',
  'danger',
  'quote',
  'example',
  'abstract',
  'todo',
]);

export function preprocessMarkdown(input: string): string {
  const lines = input.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^>\s*\[!(\w+)\](\+|-)?\s*(.*)$/);
    if (m && CALLOUT_KINDS.has(m[1].toLowerCase())) {
      const kind = m[1].toLowerCase();
      const titleRaw = m[3].trim();
      out.push(`> [callout:${kind}] ${titleRaw}`);
      i++;
      while (i < lines.length && lines[i].startsWith('>')) {
        out.push(lines[i]);
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  let body = out.join('\n');

  // Transclusion: ![[id]] → [mc-transclude:id](mc:transclude/id)
  body = body.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id, _alias) => {
    return `[mc-transclude:${id}](mc:transclude/${encodeURIComponent(id)})`;
  });

  // Wikilink: [[id|alias]] or [[id]] → [alias](mc:wikilink/id)
  body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id, alias) => {
    const display = (alias ?? id).toString();
    return `[${display}](mc:wikilink/${encodeURIComponent(id)})`;
  });

  return body;
}

/**
 * Trim potentially-incomplete trailing tokens for safer streaming render.
 * Specifically, an unclosed code fence can blow up rehype-highlight; we add a
 * temporary closing fence so the partial block renders.
 */
export function safeForStreaming(text: string): string {
  // count unclosed code fences
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 === 1) return `${text}\n\`\`\``;
  return text;
}
