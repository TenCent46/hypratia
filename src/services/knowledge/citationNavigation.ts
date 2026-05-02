import { useStore } from '../../store';
import {
  joinKnowledgePath,
  knowledgePathExists,
  readKnowledgeText,
} from '../storage/KnowledgeFileService';
import { resolveMarkdownRoot } from '../storage/MarkdownFileService';
import {
  PROJECT_RAW_DIR,
  defaultProcessedPath,
  projectBasePath,
  projectProcessedPath,
} from './knowledgeBaseLayout';
import type { KnowledgeDocumentRecord } from './projectRetrievalCore';
import type { Project } from '../../types';

export type CitationDescriptor = {
  filename: string;
  pageStart?: number;
  pageEnd?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
};

export type CitationOpenRequest = CitationDescriptor & {
  /** Optional project hint used to disambiguate same-named files across
   *  workspaces. Falls back to the active conversation's project. */
  projectName?: string;
  /** Debug correlation id propagated from the clicked markdown link. */
  debugId?: string;
};

export type ResolvedCitation = {
  documentId: string;
  sourcePath: string;
  projectName: string;
  status: 'ok' | 'error';
  error?: string;
  pageStart?: number;
  pageEnd?: number;
  sentenceStart?: number;
  sentenceEnd?: number;
};

const DOCUMENTS_FILENAME = 'documents.json';

function projectByNameOrSlug(projectName: string | undefined) {
  if (!projectName) return undefined;
  const trimmed = projectName.trim();
  if (!trimmed) return undefined;
  const projects = useStore.getState().projects;
  return projects.find(
    (p) =>
      p.name === trimmed ||
      projectBasePath(p) === trimmed ||
      projectBasePath(p).endsWith(`/${trimmed}`),
  );
}

function projectForActiveConversation(): Project | undefined {
  const state = useStore.getState();
  const conv = state.conversations.find(
    (c) => c.id === state.settings.lastConversationId,
  );
  if (!conv?.projectId) return undefined;
  return state.projects.find((p) => p.id === conv.projectId);
}

async function readDocuments(processedDir: string): Promise<{
  rootPath: string;
  documents: KnowledgeDocumentRecord[];
}> {
  const rootPath = await resolveMarkdownRoot(
    useStore.getState().settings.markdownStorageDir,
  );
  const docsPath = await joinKnowledgePath(
    await joinKnowledgePath(rootPath, processedDir),
    DOCUMENTS_FILENAME,
  );
  console.info('[mc:pdf-link] 05a read processed documents', {
    processedDir,
    docsPath,
  });
  if (!(await knowledgePathExists(docsPath))) {
    console.warn('[mc:pdf-link] 05b documents.json missing', {
      processedDir,
      docsPath,
    });
    return { rootPath, documents: [] };
  }
  try {
    const text = await readKnowledgeText(docsPath);
    const parsed = JSON.parse(text) as KnowledgeDocumentRecord[];
    console.info('[mc:pdf-link] 05c documents.json parsed', {
      processedDir,
      docsPath,
      documents: Array.isArray(parsed) ? parsed.length : 0,
    });
    return { rootPath, documents: Array.isArray(parsed) ? parsed : [] };
  } catch (err) {
    console.warn('[mc:pdf-link] 05d documents.json parse failed', {
      processedDir,
      docsPath,
      err,
    });
    return { rootPath, documents: [] };
  }
}

function processedDirForProject(project: Project | undefined): string {
  return project ? projectProcessedPath(project) : defaultProcessedPath();
}

function rawDirForProject(project: Project | undefined): string {
  if (project) return `${projectBasePath(project)}/${PROJECT_RAW_DIR}`;
  return `default/${PROJECT_RAW_DIR}`;
}

/**
 * Look up a document by filename within a project's processed index.
 * Filename-only matching is intentionally lenient: the chat citation
 * format `[filename.ext, p. N]` doesn't carry the directory portion.
 *
 * Resolution order:
 *   1. Hint project (request.projectName) processed/documents.json
 *   2. Active conversation's project processed/documents.json
 *   3. Fallback scan across every other indexed project + default
 *      workspace, so a citation in a chat that is wired to a project
 *      different from the cited file's project still resolves.
 * If multiple basenames collide the lexicographically-first sourcePath
 * wins, with a warning so it can be diagnosed.
 */
export async function resolveCitation(
  request: CitationOpenRequest,
): Promise<ResolvedCitation | null> {
  const targetName = request.filename.trim().toLowerCase();
  const hintProject = projectByNameOrSlug(request.projectName);
  const activeProject = projectForActiveConversation();
  const allProjects = useStore.getState().projects;

  type Probe = { label: string; project: Project | undefined };
  const probes: Probe[] = [];
  const seenDirs = new Set<string>();
  function pushProbe(label: string, project: Project | undefined) {
    const dir = processedDirForProject(project);
    if (seenDirs.has(dir)) return;
    seenDirs.add(dir);
    probes.push({ label, project });
  }
  if (hintProject) pushProbe('hint', hintProject);
  if (activeProject) pushProbe('active-conversation', activeProject);
  pushProbe('default-workspace', undefined);
  for (const p of allProjects) pushProbe(`project:${p.name}`, p);

  console.debug('[mc:cite] resolveCitation start', {
    debugId: request.debugId,
    filename: request.filename,
    pageStart: request.pageStart,
    sentenceStart: request.sentenceStart,
    probes: probes.map((p) => p.label),
  });
  console.info('[mc:pdf-link] 05 resolveCitation start', {
    debugId: request.debugId,
    filename: request.filename,
    targetName,
    hintProject: hintProject?.name,
    activeProject: activeProject?.name,
    probes: probes.map((p) => ({
      label: p.label,
      processedDir: processedDirForProject(p.project),
      projectName: p.project?.name ?? 'Default workspace',
    })),
  });

  for (const probe of probes) {
    const processedDir = processedDirForProject(probe.project);
    const { documents } = await readDocuments(processedDir);
    const matches = documents.filter((doc) => {
      const fname = doc.sourcePath.split('/').pop()?.toLowerCase();
      return fname === targetName;
    });
    const sampleDocuments = documents.slice(0, 8).map((doc) => ({
      sourcePath: doc.sourcePath,
      filename: doc.sourcePath.split('/').pop(),
      status: doc.status,
    }));
    console.debug('[mc:cite] probe', {
      debugId: request.debugId,
      label: probe.label,
      processedDir,
      docsTotal: documents.length,
      matchCount: matches.length,
    });
    console.info('[mc:pdf-link] 05e resolveCitation probe result', {
      debugId: request.debugId,
      label: probe.label,
      processedDir,
      docsTotal: documents.length,
      matchCount: matches.length,
      matches: matches.map((m) => ({
        documentId: m.documentId,
        sourcePath: m.sourcePath,
        status: m.status,
        error: m.error,
      })),
      sampleDocuments,
    });
    if (matches.length === 0) continue;
    if (matches.length > 1) {
      console.warn('[mc:cite] ambiguous filename — multiple matches', {
        filename: request.filename,
        probe: probe.label,
        matches: matches.map((m) => m.sourcePath),
      });
    }
    matches.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
    const doc = matches[0];
    console.debug('[mc:cite] resolveCitation matched', {
      debugId: request.debugId,
      probe: probe.label,
      sourcePath: doc.sourcePath,
      documentId: doc.documentId,
      status: doc.status,
    });
    console.info('[mc:pdf-link] 05f resolveCitation returning match', {
      debugId: request.debugId,
      probe: probe.label,
      documentId: doc.documentId,
      sourcePath: doc.sourcePath,
      projectName: doc.projectName,
      status: doc.status,
      error: doc.error,
      requestedPageStart: request.pageStart,
    });
    return {
      documentId: doc.documentId,
      sourcePath: doc.sourcePath,
      projectName: doc.projectName,
      status: doc.status,
      error: doc.error,
      pageStart: request.pageStart,
      pageEnd: request.pageEnd,
      sentenceStart: request.sentenceStart,
      sentenceEnd: request.sentenceEnd,
    };
  }

  console.warn('[mc:cite] resolveCitation no match across all probes', {
    debugId: request.debugId,
    filename: request.filename,
    probes: probes.map((p) => p.label),
  });
  console.warn('[mc:pdf-link] 05z resolveCitation no match', {
    debugId: request.debugId,
    filename: request.filename,
    targetName,
    probes: probes.map((p) => p.label),
  });
  return null;
}

/**
 * Per-file indexing status for the project knowledge UI. Returns one
 * entry per raw-folder file plus any "deleted" entries that exist in
 * documents.json but no longer appear under raw/. Used by the project
 * knowledge panel to show indexed/unchanged/error/deleted/pending badges.
 */
export type IndexingStatusEntry = {
  sourcePath: string;
  filename: string;
  status: 'indexed' | 'error' | 'deleted' | 'pending';
  error?: string;
  updatedAt?: string;
  bytes?: number;
};

export async function readProjectIndexingStatus(args: {
  projectName?: string;
  rawSourcePaths?: string[];
}): Promise<IndexingStatusEntry[]> {
  const project =
    projectByNameOrSlug(args.projectName) ?? projectForActiveConversation();
  const processedDir = processedDirForProject(project);
  const { documents } = await readDocuments(processedDir);
  const docsBySource = new Map(
    documents.map((doc) => [doc.sourcePath, doc] as const),
  );
  const out: IndexingStatusEntry[] = [];
  const seen = new Set<string>();
  const expected = args.rawSourcePaths ?? [];
  const rawDir = rawDirForProject(project);
  for (const sourcePath of expected) {
    seen.add(sourcePath);
    const doc = docsBySource.get(sourcePath);
    const filename = sourcePath.split('/').pop() ?? sourcePath;
    if (!doc) {
      out.push({ sourcePath, filename, status: 'pending' });
      continue;
    }
    out.push({
      sourcePath,
      filename,
      status: doc.status === 'error' ? 'error' : 'indexed',
      error: doc.error,
      updatedAt: doc.updatedAt,
      bytes: doc.bytes,
    });
  }
  for (const doc of documents) {
    if (seen.has(doc.sourcePath)) continue;
    if (!doc.sourcePath.startsWith(`${rawDir}/`)) continue;
    out.push({
      sourcePath: doc.sourcePath,
      filename: doc.sourcePath.split('/').pop() ?? doc.sourcePath,
      status: 'deleted',
      error: doc.error,
      updatedAt: doc.updatedAt,
      bytes: doc.bytes,
    });
  }
  return out;
}
