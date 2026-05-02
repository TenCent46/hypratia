import { attachments as attachmentService } from '../attachments';
import { useStore } from '../../store';
import { generateContentTitle } from '../chat/autoTitle';
import type { ID } from '../../types';
import {
  audioMime,
  documentFormatMeta,
  extensionFromFilename,
  isTextSafeExtension,
  normalizeFilename,
  textMimeForExtension,
} from './filenames';
import {
  mirrorTextArtifactLegacy,
  resolveProjectRawPath,
} from './knowledgeBaseMirror';
import type {
  ArtifactProvider,
  ArtifactProviderId,
  ArtifactRequest,
  ArtifactResult,
  ArtifactResultErr,
  ArtifactResultOk,
  AudioFormat,
  ProviderUsage,
} from './types';

const TEXT_TAG = 'ai-generated';

export type ArtifactProgressDetail =
  | {
      phase: 'start';
      generationId: string;
      kind: 'document' | 'audio' | 'video';
      provider: ArtifactProviderId;
      filename: string;
      conversationId: string;
    }
  | {
      phase: 'success';
      generationId: string;
      kind: 'document' | 'audio' | 'video';
      provider: ArtifactProviderId;
      filename: string;
      conversationId: string;
      sizeBytes: number;
    }
  | {
      phase: 'error';
      generationId: string;
      kind: 'document' | 'audio' | 'video';
      provider?: ArtifactProviderId;
      filename: string;
      conversationId: string;
      error: string;
    };

function emitProgress(detail: ArtifactProgressDetail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<ArtifactProgressDetail>('mc:artifact-progress', {
        detail,
      }),
    );
  } catch {
    // window unavailable; fail silently
  }
}

function genId(): string {
  return `gen-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Per-conversation buffer of artifact ids the chat stream should attach to
 * the just-finalized assistant message. The chat stream hook drains this
 * after the stream completes and patches `message.attachmentIds`.
 */
const pendingByConversation = new Map<string, string[]>();

export function drainPendingArtifacts(conversationId: string): string[] {
  const buf = pendingByConversation.get(conversationId);
  if (!buf || buf.length === 0) return [];
  pendingByConversation.delete(conversationId);
  return buf;
}

function recordPending(conversationId: string, attachmentId: string) {
  const buf = pendingByConversation.get(conversationId) ?? [];
  buf.push(attachmentId);
  pendingByConversation.set(conversationId, buf);
}

export class ArtifactService {
  constructor(
    private readonly providers: {
      claudeDocument: ArtifactProvider;
      openaiDocument: ArtifactProvider;
      openaiAudio: ArtifactProvider;
      openaiVideo: ArtifactProvider;
    },
  ) {}

  async create(req: ArtifactRequest): Promise<ArtifactResult> {
    try {
      switch (req.kind) {
        case 'text':
          return await this.createText(req);
        case 'document':
          return await this.createDocument(req);
        case 'audio':
          return await this.createAudio(req);
        case 'video':
          return await this.createVideo(req);
      }
    } catch (err) {
      return errorOf(err);
    }
  }

  // ---- text ----
  private async createText(
    req: Extract<ArtifactRequest, { kind: 'text' }>,
  ): Promise<ArtifactResult> {
    const { filename, extension } = normalizeFilename(req.filename);
    if (!extension) {
      return {
        ok: false,
        error: 'text artifact requires an extension (e.g. .md)',
        provider: 'host-text',
      };
    }
    if (!isTextSafeExtension(extension)) {
      return {
        ok: false,
        error: `extension ".${extension}" is not text-safe; use create_document_artifact for binary formats`,
        provider: 'host-text',
      };
    }
    const mimeType = req.mimeType ?? textMimeForExtension(extension);
    const bytes = new TextEncoder().encode(req.textContent);
    // Auto-name text artifacts from their content. Source order:
    //   1. explicit `title` on the request
    //   2. YAML `title:` in frontmatter
    //   3. first H1 heading
    //   4. first non-empty meaningful line (clipped)
    // Falls back to the original filename when none of those produce
    // anything usable (extension is preserved in every case).
    const finalFilename = await retitleTextArtifact({
      originalFilename: filename,
      extension,
      explicitTitle: req.title,
      content: req.textContent,
    });
    return await this.commit({
      bytes,
      mimeType,
      filename: finalFilename,
      extension,
      provider: 'host-text',
      kind: 'text',
      conversationId: req.conversationId,
      sourceMessageId: req.sourceMessageId,
      title: req.title,
      saveToKnowledgeBase: req.saveToKnowledgeBase ?? extension === 'md',
      createCanvasNode: req.createCanvasNode ?? extension === 'md',
      textContentForCanvas:
        extension === 'md' || extension === 'markdown' || extension === 'mdx'
          ? req.textContent
          : undefined,
      usage: { characters: req.textContent.length },
    });
  }

  // ---- documents ----
  private async createDocument(
    req: Extract<ArtifactRequest, { kind: 'document' }>,
  ): Promise<ArtifactResult> {
    const meta = documentFormatMeta(req.format);
    const { filename } = normalizeFilename(req.filename, meta.ext);
    const order = this.documentProviderOrder(req.providerHint);
    const generationId = genId();
    let lastErr: string | undefined;
    for (const provider of order) {
      if (!(await provider.isAvailable())) {
        lastErr = `${provider.id} unavailable`;
        continue;
      }
      emitProgress({
        phase: 'start',
        generationId,
        kind: 'document',
        provider: provider.id,
        filename,
        conversationId: req.conversationId,
      });
      try {
        const out = await provider.generate({
          prompt: req.prompt,
          filename,
          format: req.format,
        });
        const result = await this.commit({
          bytes: out.bytes,
          mimeType: out.mimeType || meta.mime,
          filename: out.filename || filename,
          extension: meta.ext,
          provider: provider.id,
          kind: 'document',
          conversationId: req.conversationId,
          sourceMessageId: req.sourceMessageId,
          title: req.title,
          saveToKnowledgeBase: req.saveToKnowledgeBase ?? true,
          createCanvasNode: req.createCanvasNode ?? true,
          format: req.format,
          usage: out.usage,
        });
        emitProgress({
          phase: 'success',
          generationId,
          kind: 'document',
          provider: provider.id,
          filename: result.filename,
          conversationId: req.conversationId,
          sizeBytes: result.sizeBytes,
        });
        return result;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        emitProgress({
          phase: 'error',
          generationId,
          kind: 'document',
          provider: provider.id,
          filename,
          conversationId: req.conversationId,
          error: lastErr,
        });
      }
    }
    return {
      ok: false,
      error:
        lastErr ??
        'no document provider available (configure an Anthropic or OpenAI key in Settings)',
    };
  }

  // ---- audio ----
  private async createAudio(
    req: Extract<ArtifactRequest, { kind: 'audio' }>,
  ): Promise<ArtifactResult> {
    const provider = this.providers.openaiAudio;
    if (!(await provider.isAvailable())) {
      return {
        ok: false,
        error: 'OpenAI key not configured for audio generation',
        provider: provider.id,
      };
    }
    const format: AudioFormat = req.format ?? 'mp3';
    const { filename } = normalizeFilename(req.filename, format);
    const promptPayload = JSON.stringify({
      text: req.text,
      voice: req.voice,
      instructions: req.instructions,
      format,
    });
    const generationId = genId();
    emitProgress({
      phase: 'start',
      generationId,
      kind: 'audio',
      provider: provider.id,
      filename,
      conversationId: req.conversationId,
    });
    let out;
    try {
      out = await provider.generate({
        prompt: promptPayload,
        filename,
        format,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitProgress({
        phase: 'error',
        generationId,
        kind: 'audio',
        provider: provider.id,
        filename,
        conversationId: req.conversationId,
        error: message,
      });
      throw err;
    }
    const result = await this.commit({
      bytes: out.bytes,
      mimeType: out.mimeType || audioMime(format),
      filename: out.filename || filename,
      extension: format,
      provider: provider.id,
      kind: 'audio',
      conversationId: req.conversationId,
      sourceMessageId: req.sourceMessageId,
      title: req.title,
      saveToKnowledgeBase: req.saveToKnowledgeBase ?? true,
      createCanvasNode: req.createCanvasNode ?? true,
      format,
      usage: out.usage,
    });
    emitProgress({
      phase: 'success',
      generationId,
      kind: 'audio',
      provider: provider.id,
      filename: result.filename,
      conversationId: req.conversationId,
      sizeBytes: result.sizeBytes,
    });
    return result;
  }

  // ---- video ----
  private async createVideo(
    req: Extract<ArtifactRequest, { kind: 'video' }>,
  ): Promise<ArtifactResult> {
    const settings = useStore.getState().settings;
    if (!settings.artifacts?.videoEnabled) {
      return {
        ok: false,
        error:
          'video generation is disabled (Settings → Vault & data → Enable video generation)',
        provider: 'openai-video',
      };
    }
    const provider = this.providers.openaiVideo;
    if (!(await provider.isAvailable())) {
      return {
        ok: false,
        error: 'OpenAI key not configured for video generation',
        provider: provider.id,
      };
    }
    const { filename } = normalizeFilename(req.filename, 'mp4');
    const generationId = genId();
    emitProgress({
      phase: 'start',
      generationId,
      kind: 'video',
      provider: provider.id,
      filename,
      conversationId: req.conversationId,
    });
    let out;
    try {
      out = await provider.generate({
        prompt: JSON.stringify({
          prompt: req.prompt,
          seconds: req.seconds,
          size: req.size,
        }),
        filename,
        format: 'mp4',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitProgress({
        phase: 'error',
        generationId,
        kind: 'video',
        provider: provider.id,
        filename,
        conversationId: req.conversationId,
        error: message,
      });
      throw err;
    }
    const result = await this.commit({
      bytes: out.bytes,
      mimeType: out.mimeType || 'video/mp4',
      filename: out.filename || filename,
      extension: 'mp4',
      provider: provider.id,
      kind: 'video',
      conversationId: req.conversationId,
      sourceMessageId: req.sourceMessageId,
      title: req.title,
      saveToKnowledgeBase: req.saveToKnowledgeBase ?? true,
      createCanvasNode: req.createCanvasNode ?? true,
      usage: out.usage,
    });
    emitProgress({
      phase: 'success',
      generationId,
      kind: 'video',
      provider: provider.id,
      filename: result.filename,
      conversationId: req.conversationId,
      sizeBytes: result.sizeBytes,
    });
    return result;
  }

  // ---- shared commit ----
  private async commit(args: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
    extension: string;
    provider: ArtifactProviderId;
    kind: 'text' | 'document' | 'audio' | 'video';
    conversationId: ID;
    sourceMessageId?: ID;
    title?: string;
    saveToKnowledgeBase: boolean;
    createCanvasNode: boolean;
    textContentForCanvas?: string;
    format?: string;
    usage?: ProviderUsage;
  }): Promise<ArtifactResultOk> {
    if (args.bytes.byteLength === 0) {
      throw new Error('provider returned 0 bytes');
    }
    const att = await attachmentService.ingest({
      kind: 'bytes',
      bytes: args.bytes,
      suggestedName: args.filename,
      mimeType: args.mimeType,
      // Pass the conversation through so the raw-attachment mirror routes
      // the file into [project]/raw/ (or default/raw/) instead of falling
      // back to settings.lastConversationId.
      conversationId: args.conversationId,
    });
    const store = useStore.getState();
    store.addAttachment(att);

    const createdAt = new Date().toISOString();
    let nodeId: ID | undefined;
    if (args.createCanvasNode) {
      const isMarkdownText =
        args.kind === 'text' &&
        (args.extension === 'md' ||
          args.extension === 'markdown' ||
          args.extension === 'mdx');
      const node = store.addNode({
        conversationId: args.conversationId,
        kind: isMarkdownText ? 'markdown' : 'artifact',
        title: args.title ?? args.filename,
        contentMarkdown:
          args.textContentForCanvas ??
          `**${args.filename}** · ${formatBytes(args.bytes.byteLength)} · ${args.provider}`,
        position: { x: 240, y: 240 },
        tags: [TEXT_TAG, args.provider, args.kind, args.extension],
        attachmentIds: [att.id],
      });
      nodeId = node.id;
    }

    let knowledgeBasePath: string | undefined;
    if (args.saveToKnowledgeBase) {
      try {
        // The raw bytes are already mirrored into `[project]/raw/<file>` by
        // the attachment ingest path (see TauriAttachmentService). We just
        // record the resolved path here so the chat artifact card can show
        // "saved to <path>" without re-writing the file.
        knowledgeBasePath = await resolveProjectRawPath({
          conversationId: args.conversationId,
          filename: args.filename,
        });
        if (
          !knowledgeBasePath &&
          args.kind === 'text' &&
          (args.extension === 'md' ||
            args.extension === 'markdown' ||
            args.extension === 'mdx')
        ) {
          // Incognito (or other reasons we couldn't route to a project)
          // still needs the markdown body somewhere readable. Fall back
          // to the legacy `Artifacts/YYYY-MM/...` sidecar with frontmatter.
          knowledgeBasePath = await mirrorTextArtifactLegacy({
            filename: args.filename,
            content: args.textContentForCanvas ?? '',
            artifactId: att.id,
            provider: args.provider,
            conversationId: args.conversationId,
            sourceMessageId: args.sourceMessageId,
            title: args.title,
            createdAt,
          });
        }
      } catch {
        // mirror failures are not fatal — surface elsewhere later
      }
    }

    recordPending(args.conversationId, att.id);
    store.recordArtifactUsage({
      artifactId: att.id,
      conversationId: args.conversationId,
      provider: args.provider,
      kind: args.kind,
      format: args.format ?? args.extension,
      filename: args.filename,
      sizeBytes: args.bytes.byteLength,
      usage: args.usage,
      createdAt,
    });
    return {
      ok: true,
      artifactId: att.id,
      filename: args.filename,
      extension: args.extension,
      mimeType: args.mimeType,
      attachmentId: att.id,
      nodeId,
      knowledgeBasePath,
      provider: args.provider,
      sizeBytes: args.bytes.byteLength,
      sourceConversationId: args.conversationId,
      sourceMessageId: args.sourceMessageId,
      createdAt,
    };
  }

  private documentProviderOrder(
    hint: 'claude' | 'openai' | undefined,
  ): ArtifactProvider[] {
    const settings = useStore.getState().settings;
    const preferred =
      hint ?? settings.artifacts?.documentProvider ?? 'claude';
    return preferred === 'openai'
      ? [this.providers.openaiDocument, this.providers.claudeDocument]
      : [this.providers.claudeDocument, this.providers.openaiDocument];
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Derive a meaningful filename for a text artifact from its content.
 *
 * Order:
 *   1. explicit `title` on the request
 *   2. YAML frontmatter `title:`
 *   3. first `# H1` heading
 *   4. AI-generated title via the free Groq Llama / OpenAI mini path
 *      (skipped silently when no provider is configured)
 *   5. first non-empty meaningful line (clipped)
 *
 * Always preserves the original extension. Async because step 4 is a
 * network call; the caller is already async so this adds no UI latency
 * beyond the AI hop itself (typically <1s on Groq).
 */
async function retitleTextArtifact(args: {
  originalFilename: string;
  extension: string;
  explicitTitle?: string;
  content: string;
}): Promise<string> {
  const strong = pickStrongStemFromContent(args);
  if (strong) {
    const safe = sanitizeFilenameStem(strong);
    if (safe) return `${safe}.${args.extension}`;
  }
  // Try the AI as a stronger title source than first-line heuristic.
  // Failure / unavailability falls through to the heuristic.
  try {
    const aiTitle = await generateContentTitle({
      content: args.content,
      kind: 'document',
    });
    const safe = sanitizeFilenameStem(aiTitle ?? '');
    if (safe && safe.toLowerCase() !== 'untitled') {
      return `${safe}.${args.extension}`;
    }
  } catch {
    // ignored — fall through to heuristic
  }
  const heuristic = pickFirstLineStem(args.content);
  if (heuristic) {
    const safe = sanitizeFilenameStem(heuristic);
    if (safe) return `${safe}.${args.extension}`;
  }
  return args.originalFilename;
}

function pickStrongStemFromContent(args: {
  explicitTitle?: string;
  content: string;
}): string | null {
  const explicit = args.explicitTitle?.trim();
  if (explicit && explicit.length > 0 && explicit.length <= 120) return explicit;
  const fmMatch = args.content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const titleLine = fmMatch[1].match(/^title:\s*(.+)$/m);
    if (titleLine) {
      const t = titleLine[1].replace(/^["']|["']$/g, '').trim();
      if (t.length > 0 && t.length <= 120) return t;
    }
  }
  const body = fmMatch
    ? args.content.slice(fmMatch[0].length)
    : args.content;
  for (const line of body.split('\n')) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      const t = h1[1].trim();
      if (t.length > 0 && t.length <= 120) return t;
    }
  }
  return null;
}

function pickFirstLineStem(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;
  for (const line of body.split('\n')) {
    const trimmed = line.trim().replace(/^[#>*\-_+\s]+/, '').trim();
    if (trimmed.length >= 3) return trimmed.slice(0, 80);
  }
  return null;
}

function sanitizeFilenameStem(value: string): string {
  // Replace separators and reserved chars with `-`, collapse whitespace,
  // strip surrounding dots/dashes, cap length so the result still fits a
  // sensible filename across macOS/Windows.
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '')
    .trim();
  return cleaned.slice(0, 80);
}

function errorOf(err: unknown): ArtifactResultErr {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: message };
}

export type { ArtifactRequest, ArtifactResult, ArtifactProviderId };
export { extensionFromFilename };
