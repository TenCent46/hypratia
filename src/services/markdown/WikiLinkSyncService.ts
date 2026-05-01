import type { CanvasNode } from '../../types';
import { markdownFiles } from '../storage/MarkdownFileService';

const SECTION_HEADING = '## Canvas Links';

export function wikiTitle(node: Pick<CanvasNode, 'title' | 'mdPath'>): string {
  const fromTitle = node.title?.trim();
  if (fromTitle) {
    return fromTitle
      .split('[')
      .join(' ')
      .split(']')
      .join(' ')
      .replace(/\n|\r/g, ' ')
      .trim();
  }
  const file = node.mdPath?.split('/').filter(Boolean).pop();
  return (file ?? 'Untitled').replace(/\.md$/i, '');
}

export function appendWikiLink(content: string, targetTitle: string): string {
  const link = `[[${targetTitle}]]`;
  if (content.includes(link)) return content;
  const line = `- ${link}`;
  const sectionIndex = content.lastIndexOf(SECTION_HEADING);
  if (sectionIndex === -1) {
    const trimmed = content.trimEnd();
    return `${trimmed}${trimmed ? '\n\n' : ''}${SECTION_HEADING}\n\n${line}\n`;
  }
  const before = content.slice(0, sectionIndex);
  const section = content.slice(sectionIndex).trimEnd();
  return `${before}${section}\n${line}\n`;
}

export async function syncWikiLinkBetweenNodes(
  rootPath: string,
  source: CanvasNode,
  target: CanvasNode,
): Promise<void> {
  if (!source.mdPath || !target.mdPath) return;
  const sourceContent = await markdownFiles.readFile(rootPath, source.mdPath);
  const sourceNext = appendWikiLink(sourceContent, wikiTitle(target));
  if (sourceNext !== sourceContent) {
    await markdownFiles.writeFile(rootPath, source.mdPath, sourceNext);
  }

  const targetContent = await markdownFiles.readFile(rootPath, target.mdPath);
  const targetNext = appendWikiLink(targetContent, wikiTitle(source));
  if (targetNext !== targetContent) {
    await markdownFiles.writeFile(rootPath, target.mdPath, targetNext);
  }
}
