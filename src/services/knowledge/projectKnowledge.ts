import matter from 'gray-matter';
import { useStore } from '../../store';
import {
  resolveMarkdownRoot,
  tryReadMarkdownFile,
} from '../storage/MarkdownFileService';
import {
  defaultInstructionPath,
  defaultMetaInstructionPath,
  defaultMemoryPath,
  legacyProjectInstructionPath,
  legacyProjectMemoryPath,
  projectInstructionPath,
  projectMetaInstructionPath,
  projectMemoryPath,
} from './knowledgeBaseLayout';
import {
  ensureProjectMetaInstructionForProject,
  rebuildProjectKnowledge,
} from './projectRetrieval';

function markdownBody(text: string | null): string {
  if (!text) return '';
  try {
    return matter(text).content.trim();
  } catch {
    return text.trim();
  }
}

async function readWithFallback(
  rootPath: string,
  primary: string,
  legacy: string | null,
): Promise<string | null> {
  const next = await tryReadMarkdownFile(rootPath, primary);
  if (next !== null) return next;
  if (!legacy) return null;
  return tryReadMarkdownFile(rootPath, legacy);
}

/**
 * Build the system-prompt context that gets injected before every chat
 * send. Reads `instruction.md` and `memory.md` for the conversation's
 * project (or the default workspace if the conversation has no project).
 */
export async function readProjectKnowledgeContext(
  projectId: string | undefined,
): Promise<string | null> {
  const state = useStore.getState();
  const rootPath = await resolveMarkdownRoot(state.settings.markdownStorageDir);
  const project = projectId
    ? state.projects.find((p) => p.id === projectId)
    : null;

  await ensureProjectMetaInstructionForProject(project?.name);

  const [instructionRaw, memoryRaw, metaRaw] = await Promise.all(
    project
      ? [
          readWithFallback(
            rootPath,
            projectInstructionPath(project),
            legacyProjectInstructionPath(project),
          ),
          readWithFallback(
            rootPath,
            projectMemoryPath(project),
            legacyProjectMemoryPath(project),
          ),
          tryReadMarkdownFile(rootPath, projectMetaInstructionPath(project)),
        ]
      : [
          tryReadMarkdownFile(rootPath, defaultInstructionPath()),
          tryReadMarkdownFile(rootPath, defaultMemoryPath()),
          tryReadMarkdownFile(rootPath, defaultMetaInstructionPath()),
        ],
  );

  const instruction = markdownBody(instructionRaw);
  const memory = markdownBody(memoryRaw);
  const meta = markdownBody(metaRaw);
  const systemPrompt = project?.systemPrompt?.trim() ?? '';
  void rebuildProjectKnowledge(project?.name).catch((err) => {
    console.warn('[knowledge] background rebuild failed', err);
  });
  if (!instruction && !memory && !meta && !systemPrompt) return null;

  const heading = project
    ? 'Project Knowledge Base context:'
    : 'Default workspace Knowledge Base context:';
  return [
    heading,
    '',
    systemPrompt ? `## Project system prompt\n${systemPrompt}` : '',
    instruction ? `## instruction.md\n${instruction}` : '',
    memory ? `## memory.md\n${memory}` : '',
    meta ? `## meta-instruction.md\n${meta}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
