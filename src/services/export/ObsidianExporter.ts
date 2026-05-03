import { appDataDir, join } from '@tauri-apps/api/path';
import {
  copyFile,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type {
  Attachment,
  CanvasNode,
  Conversation,
  Edge,
  Message,
} from '../../types';
import { safeFilename } from './filenames';
import { buildMarkdown, readFrontmatterId } from './frontmatter';
import {
  absoluteMarkdownPath,
  resolveMarkdownRoot,
} from '../storage/MarkdownFileService';
import {
  buildNaturalWikilink,
  buildTitleCounts,
  mergeAliases,
  wikiTitle,
} from '../markdown/wikilinks';
import { useStore } from '../../store';

export type ExportSnapshot = {
  conversations: Conversation[];
  messages: Message[];
  nodes: CanvasNode[];
  edges: Edge[];
  attachments: Attachment[];
};

export type ExportSummary = {
  vault: string;
  conversations: number;
  nodes: number;
  maps: number;
  attachments: number;
  skipped: { path: string; reason: string }[];
};

// Hypratia-canonical layout. The migration tool moves any pre-existing
// `LLM-*` folders into this same shape — see
// `src/services/migration/legacyVaultMigration.ts`. This module is the
// single emitter; nothing else writes vault paths.
const DIR_CONVS = 'Hypratia/Notes';
const DIR_NODES = 'Hypratia/Notes';
const DIR_MAPS = 'Hypratia/Canvases';
const DIR_DAILY = 'Hypratia/Daily';
const DIR_ATTACHMENTS = 'Hypratia/Attachments';

/**
 * Build a vault-relative path (without `.md`) for a node — used as the
 * disambiguator in path-form wikilinks `[[path|Title]]`.
 */
function vaultPathForNode(node: CanvasNode): string {
  const filename = safeFilename(`node-${node.id}`, node.title, '.md');
  return `${DIR_NODES}/${filename.replace(/\.(md|markdown)$/i, '')}`;
}

async function ensureDir(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

async function safeWrite(
  path: string,
  expectedId: string,
  content: string,
  skipped: ExportSummary['skipped'],
): Promise<boolean> {
  if (await exists(path)) {
    try {
      const existingId = readFrontmatterId(await readTextFile(path));
      if (existingId !== null && existingId !== expectedId) {
        skipped.push({
          path,
          reason: `frontmatter id mismatch (expected ${expectedId}, found ${existingId})`,
        });
        return false;
      }
    } catch {
      // unreadable; we'll overwrite — but only if no id in the file
    }
  }
  await writeTextFile(path, content);
  return true;
}

export class ObsidianExporter {
  async exportAll(
    vaultPath: string,
    snap: ExportSnapshot,
  ): Promise<ExportSummary> {
    const summary: ExportSummary = {
      vault: vaultPath,
      conversations: 0,
      nodes: 0,
      maps: 0,
      attachments: 0,
      skipped: [],
    };

    if (!vaultPath) throw new Error('No vault path configured');

    const dirConvs = await join(vaultPath, DIR_CONVS);
    const dirDaily = await join(vaultPath, DIR_DAILY);
    const dirNodes = await join(vaultPath, DIR_NODES);
    const dirMaps = await join(vaultPath, DIR_MAPS);
    const dirAttachments = await join(vaultPath, DIR_ATTACHMENTS);
    await ensureDir(vaultPath);
    await ensureDir(dirConvs);
    await ensureDir(dirDaily);
    await ensureDir(dirNodes);
    await ensureDir(dirMaps);
    await ensureDir(dirAttachments);

    // Copy attachments into the export vault. Source path resolution
    // dispatches on `storageRoot`: legacy records still live under
    // `<appData>/attachments/...`, vault-canonical records live under the
    // user's Markdown working folder.
    const appData = await appDataDir();
    const markdownRoot = await resolveMarkdownRoot(
      useStore.getState().settings.markdownStorageDir,
    );
    async function resolveAttachmentSource(att: Attachment): Promise<string> {
      switch (att.storageRoot ?? 'appData') {
        case 'vault':
          return absoluteMarkdownPath(markdownRoot, att.relPath);
        case 'appData':
          return join(appData, att.relPath);
        case 'external':
          throw new Error('external storageRoot not supported during export');
      }
    }
    const attachmentByFilename = new Map<string, string>(); // source relPath → vault relPath
    for (const att of snap.attachments) {
      let srcPath: string;
      try {
        srcPath = await resolveAttachmentSource(att);
      } catch (err) {
        summary.skipped.push({
          path: att.relPath,
          reason: `attachment source resolution failed: ${String(err)}`,
        });
        continue;
      }
      if (!(await exists(srcPath))) {
        summary.skipped.push({ path: srcPath, reason: 'attachment file missing' });
        continue;
      }
      const dstPath = await join(dirAttachments, att.filename);
      try {
        if (!(await exists(dstPath))) {
          await copyFile(srcPath, dstPath);
        }
        attachmentByFilename.set(
          att.relPath,
          `${DIR_ATTACHMENTS}/${att.filename}`,
        );
        summary.attachments += 1;
      } catch (err) {
        summary.skipped.push({
          path: dstPath,
          reason: `attachment copy failed: ${String(err)}`,
        });
      }
    }

    function rewriteAttachmentLinks(body: string): string {
      let out = body;
      for (const [from, to] of attachmentByFilename) {
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(escaped, 'g'), to);
      }
      return out;
    }

    // Pre-index linked node ids per node
    const incoming = new Map<string, Set<string>>();
    const outgoing = new Map<string, Set<string>>();
    for (const e of snap.edges) {
      if (!outgoing.has(e.sourceNodeId))
        outgoing.set(e.sourceNodeId, new Set());
      outgoing.get(e.sourceNodeId)!.add(e.targetNodeId);
      if (!incoming.has(e.targetNodeId))
        incoming.set(e.targetNodeId, new Set());
      incoming.get(e.targetNodeId)!.add(e.sourceNodeId);
    }

    // Nodes
    const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
    // Title-collision counts drive the natural-wikilink builder. Computed
    // once per export run; fed to every link emission below so duplicate
    // titles fall back to `[[path|Title]]` instead of leaking node ids.
    const titleCounts = buildTitleCounts(snap.nodes);
    for (const node of snap.nodes) {
      const linked = new Set<string>([
        ...(outgoing.get(node.id) ?? []),
        ...(incoming.get(node.id) ?? []),
      ]);
      const linkedNodeIds = Array.from(linked);
      const filename = safeFilename(`node-${node.id}`, node.title, '.md');
      const path = await join(dirNodes, filename);
      const linkLines = linkedNodeIds
        .map((id) => nodeById.get(id))
        .filter((n): n is CanvasNode => Boolean(n))
        .map(
          (n) =>
            `- ${buildNaturalWikilink(
              {
                title: wikiTitle(n),
                path: vaultPathForNode(n),
                hypratiaId: n.id,
              },
              titleCounts,
            )}`,
        );
      const attachmentEmbeds = (node.attachmentIds ?? [])
        .map((id) => snap.attachments.find((a) => a.id === id))
        .filter((a): a is Attachment => Boolean(a))
        .map((a) => {
          const vaultRel = attachmentByFilename.get(a.relPath);
          if (!vaultRel) return '';
          if (a.kind === 'image') return `![[${a.filename}]]`;
          return `[[${a.filename}]]`;
        })
        .filter(Boolean)
        .join('\n');
      const baseBody = rewriteAttachmentLinks(node.contentMarkdown);
      const body =
        baseBody +
        (attachmentEmbeds ? `\n\n${attachmentEmbeds}\n` : '') +
        (linkLines.length
          ? `\n\n## Linked\n\n${linkLines.join('\n')}\n`
          : '');
      // Merge `aliases` so Obsidian can resolve `[[Title]]` even when the
      // file lives under `LLM-Nodes/node-{id}-{slug}.md`. User-set aliases
      // (in `node.frontmatter.aliases`) survive — we only ADD the current
      // title if it isn't already there.
      const existingAliases = Array.isArray(
        (node.frontmatter as Record<string, unknown> | undefined)?.aliases,
      )
        ? ((node.frontmatter as Record<string, unknown>).aliases as string[])
        : undefined;
      const aliases = mergeAliases(existingAliases, wikiTitle(node));
      const content = buildMarkdown(
        {
          ...(node.frontmatter ?? {}),
          id: node.id,
          conversationId: node.conversationId,
          title: node.title,
          aliases,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          tags: node.tags,
          linkedNodeIds,
          sourceMessageId: node.sourceMessageId ?? null,
          ...(node.pdfRef
            ? {
                pdfRef: {
                  attachmentId: node.pdfRef.attachmentId,
                  page: node.pdfRef.page,
                  rects: node.pdfRef.rects,
                },
              }
            : {}),
          ...(node.kind ? { kind: node.kind } : {}),
        },
        body,
      );
      const ok = await safeWrite(path, node.id, content, summary.skipped);
      if (ok) summary.nodes += 1;
    }

    // Conversations
    const messagesByConv = new Map<string, Message[]>();
    for (const m of snap.messages) {
      if (!messagesByConv.has(m.conversationId))
        messagesByConv.set(m.conversationId, []);
      messagesByConv.get(m.conversationId)!.push(m);
    }
    for (const conv of snap.conversations) {
      const isDaily = conv.kind === 'daily';
      const prefix = isDaily ? 'daily' : 'conv';
      const filename = safeFilename(`${prefix}-${conv.id}`, conv.title, '.md');
      const path = await join(isDaily ? dirDaily : dirConvs, filename);
      const transcript = (messagesByConv.get(conv.id) ?? [])
        .map(
          (m) =>
            `**${m.role}** · ${new Date(m.createdAt).toLocaleString()}\n\n${m.content}\n`,
        )
        .join('\n---\n\n');
      const convNodes = snap.nodes.filter((n) => n.conversationId === conv.id);
      const mapSection = convNodes.length
        ? `\n\n## Map\n\n${convNodes
            .map(
              (n) =>
                `- ${buildNaturalWikilink(
                  {
                    title: wikiTitle(n),
                    path: vaultPathForNode(n),
                    hypratiaId: n.id,
                  },
                  titleCounts,
                )}`,
            )
            .join('\n')}\n`
        : '';
      const body = `${transcript || '_(no messages)_'}${mapSection}`;
      const content = buildMarkdown(
        {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: messagesByConv.get(conv.id)?.length ?? 0,
        },
        body,
      );
      const ok = await safeWrite(path, conv.id, content, summary.skipped);
      if (ok) summary.conversations += 1;
    }

    // Maps
    for (const conv of snap.conversations) {
      const convNodes = snap.nodes
        .filter((n) => n.conversationId === conv.id)
        .map((n) => ({ id: n.id, title: n.title, position: n.position, tags: n.tags }));
      const convNodeIds = new Set(convNodes.map((n) => n.id));
      const convEdges = snap.edges
        .filter(
          (e) =>
            convNodeIds.has(e.sourceNodeId) || convNodeIds.has(e.targetNodeId),
        )
        .map((e) => ({
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          label: e.label ?? null,
        }));
      const path = await join(dirMaps, `${conv.id}.json`);
      const content = JSON.stringify(
        {
          conversationId: conv.id,
          updatedAt: new Date().toISOString(),
          nodes: convNodes,
          edges: convEdges,
        },
        null,
        2,
      );
      await writeTextFile(path, content);
      summary.maps += 1;
    }

    return summary;
  }
}

export const obsidianExporter = new ObsidianExporter();
