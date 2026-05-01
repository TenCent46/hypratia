import {
  resolveMarkdownRoot,
  writeMarkdownFileEnsuringDirs,
} from '../storage/MarkdownFileService';
import {
  PROJECT_RAW_DIR,
  ROOT_RAW_DIR,
  projectBasePath,
} from '../knowledge/knowledgeBaseLayout';
import { useStore } from '../../store';
import type { ArtifactProviderId } from './types';

const LEGACY_ARTIFACT_ROOT = 'Artifacts';

function monthBucket(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}

export type LegacyMirrorTextInput = {
  filename: string;
  content: string;
  artifactId: string;
  provider: ArtifactProviderId;
  conversationId: string;
  sourceMessageId?: string;
  title?: string;
  createdAt: string;
};

/**
 * Project-aware lookup: returns the relative path inside the user's
 * Knowledge Base where the raw artifact bytes were just placed by the
 * attachment ingest mirror. Returns `undefined` when the conversation is
 * not mirrorable (incognito unprojected chats), so the caller can decide
 * whether to fall back to the legacy `Artifacts/` sidecar.
 */
export async function resolveProjectRawPath(args: {
  conversationId: string;
  filename: string;
}): Promise<string | undefined> {
  const state = useStore.getState();
  const conv = state.conversations.find((c) => c.id === args.conversationId);
  const project = conv?.projectId
    ? state.projects.find((p) => p.id === conv.projectId)
    : undefined;
  if (!project && state.settings.incognitoUnprojectedChats) return undefined;
  const rawDir = project
    ? `${projectBasePath(project)}/${PROJECT_RAW_DIR}`
    : ROOT_RAW_DIR;
  return `${rawDir}/${args.filename}`;
}

/**
 * Legacy fallback: write a frontmatter-wrapped markdown sidecar into
 * `Artifacts/YYYY-MM/...`. Used only when the project-raw mirror is
 * unavailable (incognito) so the user still has something to open.
 */
export async function mirrorTextArtifactLegacy(
  input: LegacyMirrorTextInput,
): Promise<string | undefined> {
  const settings = useStore.getState().settings;
  if (settings.artifacts?.mirrorTextToKnowledgeBase === false) return undefined;
  const root = await resolveMarkdownRoot(settings.markdownStorageDir);
  const folder = `${LEGACY_ARTIFACT_ROOT}/${monthBucket(new Date(input.createdAt))}`;
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
