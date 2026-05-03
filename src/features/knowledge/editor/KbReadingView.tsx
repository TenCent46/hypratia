import { useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { preprocessMarkdown } from '../../../services/markdown/preprocess';
import { preloadKbFiles } from './extensions/wikilink';
import {
  dispatchWikilinkResolution,
  resolveClickedWikilink,
} from '../../../services/markdown/wikilinkResolverFs';

/**
 * Reading-mode renderer that reuses the standard `react-markdown` stack
 * (GFM, math, syntax highlighting, callouts via the existing
 * `preprocess.ts`) and adds two extra link transforms:
 *
 *   - `[[node-<id>...]]` keeps its existing canvas-node behaviour by
 *     passing through `preprocessMarkdown` (which yields
 *     `mc:wikilink/<id>`).
 *   - `[[Note Title]]` becomes `mc:kb-link/<encoded>` so clicking opens
 *     the Knowledge Base file.
 *
 * We deliberately do not delegate to the existing `MarkdownRenderer`
 * component because its `a` override resolves wikilinks against canvas
 * nodes in the Zustand store. Reading-mode here needs file resolution
 * instead, so we replicate the renderer locally with a different `a`
 * branch.
 */
export function KbReadingView({
  source,
  rootPath,
}: {
  source: string;
  rootPath: string;
}) {
  // Pre-warm the wikilink cache so the first click resolves synchronously.
  useEffect(() => {
    void preloadKbFiles(rootPath);
  }, [rootPath]);

  const text = useMemo(() => kbPreprocess(source), [source]);

  return (
    <div className="markdown-document-reader">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        skipHtml
        components={{
          a({ href, children, ...rest }) {
            if (href && href.startsWith('mc:kb-link/')) {
              const target = decodeURIComponent(href.slice('mc:kb-link/'.length));
              return (
                <a
                  href="#"
                  className="wikilink"
                  onClick={async (e) => {
                    e.preventDefault();
                    // Frontmatter-aware resolution: if the target file
                    // owns a `hypratia_id` that matches a node in the
                    // store, the canvas opens it; otherwise the markdown
                    // file opens; on title collision, a chooser surfaces.
                    const resolution = await resolveClickedWikilink(
                      rootPath,
                      target,
                    );
                    dispatchWikilinkResolution(resolution, target);
                  }}
                >
                  {children}
                </a>
              );
            }
            const isExternal = !!href && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                {...rest}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noreferrer noopener' : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Run the existing wikilink preprocessor (`[[id|alias]]` → canvas
 * wikilinks) and then convert remaining `[[Note Title]]` (anything that
 * hasn't been swallowed by the canvas-node form) into `mc:kb-link/...`
 * URLs.
 */
function kbPreprocess(input: string): string {
  // First pass: existing preprocessor handles `node-<id>` and embeds.
  const intermediate = preprocessMarkdown(input);
  // Second pass: any remaining `[[X]]` is a KB file reference.
  return intermediate.replace(
    /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g,
    (_full, target: string, alias?: string) => {
      const display = (alias ?? target).trim();
      const enc = encodeURIComponent(target.trim());
      return `[${display}](mc:kb-link/${enc})`;
    },
  );
}
