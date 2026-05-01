const RESERVED_WINDOWS = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

// eslint-disable-next-line no-control-regex -- intentional: strip control chars from filenames
const ILLEGAL = /[/\\:*?"<>|\x00-\x1F]/g;

export function slugify(input: string): string {
  return input
    .normalize('NFC')
    .replace(ILLEGAL, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 80);
}

export function safeFilename(id: string, label: string, ext: string): string {
  const slug = slugify(label);
  const base = slug ? `${id}-${slug}` : id;
  const upper = base.toUpperCase();
  const reserved = RESERVED_WINDOWS.has(upper) ? `_${base}` : base;
  const capped = reserved.slice(0, 120);
  return `${capped}${ext}`;
}
