import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  markdownFiles,
  resolveMarkdownRoot,
  type MarkdownTreeNode,
} from '../../../../services/storage/MarkdownFileService';
import { flattenMarkdownTree } from '../../../../services/markdown/MarkdownContextResolver';

/**
 * Cached snapshot of the Knowledge Base file tree, keyed by root path.
 * Wikilink autocomplete and the click-to-open decoration both read this
 * cache. It refreshes lazily on `mc:knowledge-tree-refresh`.
 */
type KbFile = { path: string; stem: string; name: string };
const cacheByRoot = new Map<string, KbFile[]>();
const inflight = new Map<string, Promise<KbFile[]>>();

async function loadKbFiles(rootPath: string): Promise<KbFile[]> {
  const cached = cacheByRoot.get(rootPath);
  if (cached) return cached;
  const pending = inflight.get(rootPath);
  if (pending) return pending;
  const promise = (async () => {
    const tree = await markdownFiles.listTree(rootPath);
    const flat = flattenMarkdownTree(tree).filter((n) => n.kind === 'file');
    const files: KbFile[] = flat.map((n: MarkdownTreeNode) => ({
      path: n.path,
      name: n.name,
      stem: n.name.replace(/\.md$/i, ''),
    }));
    cacheByRoot.set(rootPath, files);
    inflight.delete(rootPath);
    return files;
  })();
  inflight.set(rootPath, promise);
  return promise;
}

function invalidateCache() {
  cacheByRoot.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('mc:knowledge-tree-refresh', invalidateCache);
}

export type WikilinkAnchor =
  | { kind: 'heading'; text: string }
  | { kind: 'block'; id: string };

export type WikilinkResolution = {
  path: string;
  anchor: WikilinkAnchor | null;
};

/**
 * Split a wikilink target into a file part and an optional anchor. We
 * mirror Obsidian's syntax:
 *   `Note#Heading` → heading anchor
 *   `Note#^block-id` → block-id anchor
 */
export function parseWikilinkTarget(target: string): {
  file: string;
  anchor: WikilinkAnchor | null;
} {
  const trimmed = target.trim();
  const hash = trimmed.indexOf('#');
  if (hash === -1) return { file: trimmed, anchor: null };
  const file = trimmed.slice(0, hash);
  const rest = trimmed.slice(hash + 1);
  if (rest.startsWith('^')) {
    return { file, anchor: { kind: 'block', id: rest.slice(1).trim() } };
  }
  return { file, anchor: { kind: 'heading', text: rest.trim() } };
}

/** Resolve a wikilink target to a KB-relative file path, if possible. */
export function resolveKbWikilinkTarget(
  rootPath: string,
  target: string,
): string | null {
  const resolved = resolveKbWikilink(rootPath, target);
  return resolved?.path ?? null;
}

export function resolveKbWikilink(
  rootPath: string,
  target: string,
): WikilinkResolution | null {
  const files = cacheByRoot.get(rootPath);
  if (!files) return null;
  const { file, anchor } = parseWikilinkTarget(target);
  if (!file) return null;
  if (file.includes('/')) {
    const candidate = file.endsWith('.md') ? file : `${file}.md`;
    const hit = files.find((f) => f.path === candidate);
    return hit ? { path: hit.path, anchor } : null;
  }
  const lc = file.toLowerCase();
  const hit =
    files.find((f) => f.stem === file) ??
    files.find((f) => f.name === file) ??
    files.find((f) => f.stem.toLowerCase() === lc);
  return hit ? { path: hit.path, anchor } : null;
}

export function getKbFilesSync(rootPath: string): KbFile[] {
  return cacheByRoot.get(rootPath) ?? [];
}

/** Autocomplete source for `[[partial`. */
export function wikilinkCompletionSource(rootPath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = context.matchBefore(/\[\[[^\]\n]*$/);
    if (!match) return null;
    if (!context.explicit && match.text.length === 2) {
      // Just typed `[[` — surface options without filtering.
    }
    const query = match.text.slice(2).toLowerCase();
    const files = await loadKbFiles(rootPath).catch(() => []);
    const ranked = [...files].sort((a, b) => {
      const al = a.stem.toLowerCase();
      const bl = b.stem.toLowerCase();
      const score = (s: string) => {
        if (!query) return 0;
        if (s.startsWith(query)) return -2;
        if (s.includes(query)) return -1;
        return 0;
      };
      const sa = score(al);
      const sb = score(bl);
      if (sa !== sb) return sa - sb;
      return al.localeCompare(bl);
    });
    return {
      from: match.from,
      filter: false,
      options: ranked.slice(0, 30).map((f) => ({
        label: f.stem,
        detail: f.path,
        apply: `[[${f.stem}]]`,
      })),
    };
  };
}

/** Tag autocomplete source for `#partial`. */
export function tagCompletionSource(getDocTags: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/(?:^|\s)#[\w/-]*$/);
    if (!match) return null;
    const offset = match.text.startsWith('#') ? match.from : match.from + 1;
    const docTags = Array.from(new Set(getDocTags()));
    return {
      from: offset,
      options: docTags.map((t) => ({ label: `#${t}` })),
    };
  };
}

/**
 * Decoration plugin that marks `[[…]]` ranges in the document so we can
 * style them as wikilinks and intercept clicks. Cmd-click opens the
 * target; an unresolved click offers to create the note via the
 * `mc:create-kb-note` event.
 */
export function wikilinkDecorations(getRoot: () => string) {
  const WIKILINK_RE = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const root = getRoot();
        const files = getKbFilesSync(root);
        const known = new Set(files.flatMap((f) => [f.stem, f.path]));
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.sliceDoc(from, to);
          let m: RegExpExecArray | null;
          WIKILINK_RE.lastIndex = 0;
          while ((m = WIKILINK_RE.exec(text)) !== null) {
            const target = m[1].trim();
            const start = from + m.index;
            const end = start + m[0].length;
            const isNodeRef = target.startsWith('node-');
            const resolved =
              !isNodeRef && (known.has(target) || target.includes('/'));
            const cls = isNodeRef
              ? 'cm-kb-wikilink cm-kb-wikilink-node'
              : resolved
                ? 'cm-kb-wikilink'
                : 'cm-kb-wikilink cm-kb-wikilink-broken';
            builder.add(
              start,
              end,
              Decoration.mark({
                class: cls,
                attributes: { 'data-target': target },
              }),
            );
          }
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(this: { decorations: DecorationSet }, e: MouseEvent, view) {
          const target = e.target as HTMLElement | null;
          if (!target) return false;
          const link = target.closest('.cm-kb-wikilink') as HTMLElement | null;
          if (!link) return false;
          const onlyMod = e.metaKey || e.ctrlKey;
          if (!onlyMod) return false;
          const wikiTarget = link.dataset.target ?? '';
          if (!wikiTarget) return false;
          e.preventDefault();
          const root = getRoot();
          const resolved = resolveKbWikilink(root, wikiTarget);
          if (resolved) {
            window.dispatchEvent(
              new CustomEvent('mc:open-markdown-file', {
                detail: { path: resolved.path, anchor: resolved.anchor },
              }),
            );
          } else {
            const { file } = parseWikilinkTarget(wikiTarget);
            window.dispatchEvent(
              new CustomEvent('mc:create-kb-note', {
                detail: { name: file || wikiTarget },
              }),
            );
          }
          // Reference `view` to satisfy the unused-arg lint rule.
          void view;
          return true;
        },
      },
    },
  );
}

/** Helper: extract `#tag` tokens from the current document text. */
export function extractDocTags(doc: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|\s)#([\w/-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    out.add(m[1]);
  }
  return Array.from(out);
}

/** Combined autocompletion extension for wikilinks + tags. */
export function wikilinkAutocomplete(rootPath: string, getDocTags: () => string[]) {
  return autocompletion({
    override: [wikilinkCompletionSource(rootPath), tagCompletionSource(getDocTags)],
    closeOnBlur: true,
    activateOnTyping: true,
  });
}

/** Pre-warm the cache so the first `[[` keystroke has data. */
export async function preloadKbFiles(rootPath: string): Promise<void> {
  await loadKbFiles(rootPath).catch(() => undefined);
}

/**
 * Resolve via async if cache miss. Used by reading-mode click handlers
 * that may run before the editor cache is warm.
 */
export async function resolveKbWikilinkTargetAsync(
  rootPath: string,
  target: string,
): Promise<string | null> {
  const sync = resolveKbWikilinkTarget(rootPath, target);
  if (sync) return sync;
  await loadKbFiles(rootPath).catch(() => []);
  return resolveKbWikilinkTarget(rootPath, target);
}

export async function resolveKbWikilinkAsync(
  rootPath: string,
  target: string,
): Promise<WikilinkResolution | null> {
  const sync = resolveKbWikilink(rootPath, target);
  if (sync) return sync;
  await loadKbFiles(rootPath).catch(() => []);
  return resolveKbWikilink(rootPath, target);
}

export async function resolveMarkdownRootCached(
  configured: string | undefined,
): Promise<string> {
  return resolveMarkdownRoot(configured);
}
