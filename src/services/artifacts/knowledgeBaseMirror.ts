import {
  resolveMarkdownRoot,
  writeMarkdownFileEnsuringDirs,
} from '../storage/MarkdownFileService';
import { useStore } from '../../store';
import type { ArtifactProviderId, ArtifactKind } from './types';

const ARTIFACT_ROOT = 'Artifacts';

function monthBucket(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}

export type MirrorTextInput = {
  filename: string;
  content: string;
  artifactId: string;
  provider: ArtifactProviderId;
  conversationId: string;
  sourceMessageId?: string;
  title?: string;
  createdAt: string;
};

export type MirrorSidecarInput = {
  basename: string;
  artifactId: string;
  artifactKind: Exclude<ArtifactKind, 'text'>;
  extension: string;
  attachmentRelPath: string;
  provider: ArtifactProviderId;
  conversationId: string;
  sourceMessageId?: string;
  title?: string;
  sizeBytes: number;
  createdAt: string;
};

async function rootPath(): Promise<string | null> {
  const settings = useStore.getState().settings;
  if (settings.artifacts?.mirrorTextToKnowledgeBase === false) return null;
  return resolveMarkdownRoot(settings.markdownStorageDir);
}

export async function mirrorTextArtifact(
  input: MirrorTextInput,
): Promise<string | undefined> {
  const root = await rootPath();
  if (!root) return undefined;
  const folder = `${ARTIFACT_ROOT}/${monthBucket(new Date(input.createdAt))}`;
  const relPath = `${folder}/${input.filename}`;

  const fm = [
    '---',
    'type: artifact',
    'artifactType: markdown',
    `artifactId: ${input.artifactId}`,
    `provider: ${input.provider}`,
    `sourceConversationId: ${input.conversationId}`,
    input.sourceMessageId ? `sourceMessageId: ${input.sourceMessageId}` : null,
    `createdAt: ${input.createdAt}`,
    input.title ? `title: "${escapeYaml(input.title)}"` : null,
    '---',
    '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
  const body = input.content.startsWith('---\n')
    ? input.content
    : `${fm}${input.content}`;
  await writeMarkdownFileEnsuringDirs(root, relPath, body);
  return relPath;
}

export async function mirrorSidecar(
  input: MirrorSidecarInput,
): Promise<string | undefined> {
  const root = await rootPath();
  if (!root) return undefined;
  const folder = `${ARTIFACT_ROOT}/${monthBucket(new Date(input.createdAt))}`;
  const relPath = `${folder}/${input.basename}.md`;

  const lines = [
    '---',
    'type: artifact',
    `artifactType: ${input.extension}`,
    `artifactKind: ${input.artifactKind}`,
    `artifactId: ${input.artifactId}`,
    `localPath: ${input.attachmentRelPath}`,
    `provider: ${input.provider}`,
    `sourceConversationId: ${input.conversationId}`,
    input.sourceMessageId ? `sourceMessageId: ${input.sourceMessageId}` : null,
    `createdAt: ${input.createdAt}`,
    `sizeBytes: ${input.sizeBytes}`,
    input.title ? `title: "${escapeYaml(input.title)}"` : null,
    '---',
    '',
    `# ${input.title ?? input.basename}`,
    '',
    `Generated \`${input.extension}\` lives at \`${input.attachmentRelPath}\`. Open via the chat artifact card or use Reveal in Finder.`,
    '',
  ];
  await writeMarkdownFileEnsuringDirs(
    root,
    relPath,
    lines.filter((l): l is string => l !== null).join('\n'),
  );
  return relPath;
}
