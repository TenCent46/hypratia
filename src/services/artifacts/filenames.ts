import { slugify } from '../export/filenames';
import type { DocumentFormat, AudioFormat } from './types';

const TEXT_EXTENSIONS = new Set([
  'md',
  'markdown',
  'mdx',
  'txt',
  'json',
  'yaml',
  'yml',
  'toml',
  'csv',
  'tsv',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'sql',
  'r',
  'lua',
  'dart',
  'm',
  'mm',
]);

const DOCUMENT_EXTENSIONS: Record<DocumentFormat, { ext: string; mime: string }> =
  {
    docx: {
      ext: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    pptx: {
      ext: 'pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    xlsx: {
      ext: 'xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    pdf: { ext: 'pdf', mime: 'application/pdf' },
  };

const AUDIO_MIMES: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

const TEXT_MIME_BY_EXT: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  mdx: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
};

export function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function isTextSafeExtension(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

export function documentFormatMeta(format: DocumentFormat) {
  return DOCUMENT_EXTENSIONS[format];
}

export function audioMime(format: AudioFormat): string {
  return AUDIO_MIMES[format] ?? 'application/octet-stream';
}

export function textMimeForExtension(ext: string, fallback?: string): string {
  return (
    TEXT_MIME_BY_EXT[ext.toLowerCase()] ??
    fallback ??
    (ext ? `text/x-${ext}` : 'text/plain')
  );
}

/**
 * Validate and normalize a model-supplied filename. Strips path separators,
 * applies the slugifier, ensures it ends with `.${expectedExt}` if provided.
 */
export function normalizeFilename(
  raw: string,
  expectedExt?: string,
): { filename: string; extension: string } {
  const cleaned = raw.replace(/^.*[\\/]/, '').trim();
  const dot = cleaned.lastIndexOf('.');
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  let ext = dot > 0 ? cleaned.slice(dot + 1).toLowerCase() : '';
  if (expectedExt) ext = expectedExt.toLowerCase();
  const slug = slugify(stem) || 'artifact';
  const filename = ext ? `${slug}.${ext}` : slug;
  return { filename, extension: ext };
}

/**
 * Best-effort language → extension mapping for the "save fenced code block"
 * action. Returns 'txt' when nothing else fits.
 */
export function extensionForLanguageHint(hint: string | undefined): string {
  const h = (hint ?? '').toLowerCase().trim();
  if (!h) return 'txt';
  const map: Record<string, string> = {
    md: 'md',
    markdown: 'md',
    mdx: 'mdx',
    text: 'txt',
    plaintext: 'txt',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    csv: 'csv',
    tsv: 'tsv',
    html: 'html',
    css: 'css',
    scss: 'scss',
    js: 'js',
    javascript: 'js',
    jsx: 'jsx',
    ts: 'ts',
    typescript: 'ts',
    tsx: 'tsx',
    py: 'py',
    python: 'py',
    rb: 'rb',
    ruby: 'rb',
    go: 'go',
    rs: 'rs',
    rust: 'rs',
    java: 'java',
    kt: 'kt',
    kotlin: 'kt',
    swift: 'swift',
    c: 'c',
    'c++': 'cpp',
    cpp: 'cpp',
    cs: 'cs',
    csharp: 'cs',
    php: 'php',
    sh: 'sh',
    bash: 'sh',
    shell: 'sh',
    zsh: 'sh',
    sql: 'sql',
    r: 'r',
    lua: 'lua',
    dart: 'dart',
  };
  return map[h] ?? (h.length <= 5 ? h : 'txt');
}
