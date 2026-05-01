import { tool } from 'ai';
import { z } from 'zod';
import { artifacts } from '../artifacts';
import { secrets, SECRET_KEY } from '../secrets';
import { useStore } from '../../store';
import type { ArtifactRequest, ArtifactResult } from '../artifacts';
import type { ID } from '../../types';

/**
 * Build the AI-SDK toolset for a given conversation. Tools are registered
 * conditionally so the model only sees what is actually wired up.
 *
 * - `create_text_artifact` is always present (text bytes never need a
 *   network call).
 * - `create_document_artifact` is registered when an Anthropic key OR an
 *   OpenAI key is configured.
 * - `create_audio_artifact` is registered when an OpenAI key is configured.
 * - `create_video_artifact` is registered when an OpenAI key is configured
 *   AND `settings.artifacts.videoEnabled === true` (Sora 2 deprecates 2026).
 *
 * `opts.dropForGoogleSearch` skips registering function tools entirely.
 * Google's `prepareTools` drops every function tool in the request when
 * the provider-defined `googleSearch` tool is present, so building them
 * here would only be wasted bytes — and confuse downstream code that
 * expects "no function tools" when web search is the only thing
 * Gemini will actually call.
 */
export async function buildTools(
  conversationId: ID,
  opts: { dropForGoogleSearch?: boolean } = {},
) {
  if (opts.dropForGoogleSearch) {
    return {} as Record<string, unknown>;
  }
  const settings = useStore.getState().settings;
  const [hasAnthropic, hasOpenAi] = await Promise.all([
    secrets.get(SECRET_KEY('anthropic')).then((k) => Boolean(k)),
    secrets.get(SECRET_KEY('openai')).then((k) => Boolean(k)),
  ]);

  const textArtifactTool = tool({
    description:
      'Save a Markdown / text / source-code file. Use this for ".md", ".txt", ".json", ".py", ".ts", and similar text-safe extensions. Do NOT use this for ".docx", ".pptx", ".xlsx", ".pdf", or any binary format — those have their own tool.',
    inputSchema: z.object({
      filename: z
        .string()
        .min(1)
        .describe('File name with extension, e.g. "plan.md".'),
      content: z.string().describe('Full text contents of the file.'),
      title: z.string().optional(),
      language: z.string().optional(),
      saveToKnowledgeBase: z.boolean().optional(),
      createCanvasNode: z.boolean().optional(),
    }),
    execute: async (args) => {
      const req: ArtifactRequest = {
        kind: 'text',
        conversationId,
        filename: args.filename,
        textContent: args.content,
        language: args.language,
        title: args.title,
        saveToKnowledgeBase: args.saveToKnowledgeBase,
        createCanvasNode: args.createCanvasNode,
      };
      return await artifacts.create(req).then(toolResultMessage);
    },
  });

  const documentArtifactTool = tool({
    description:
      'Generate a binary document file via a provider sandbox. Use this for ".docx", ".pptx", ".xlsx", and ".pdf". The model should describe the desired document in `prompt`; the provider sandbox runs Python (python-docx / python-pptx / openpyxl / reportlab) and the host downloads the resulting file. Do NOT include the file contents in the chat reply.',
    inputSchema: z.object({
      format: z
        .enum(['docx', 'pptx', 'xlsx', 'pdf'])
        .describe('Document format to generate.'),
      filename: z
        .string()
        .min(1)
        .describe('Final filename, including extension, e.g. "deck.pptx".'),
      prompt: z
        .string()
        .min(1)
        .describe(
          'Detailed brief: structure, sections/slides, copy, tone, branding hints. The provider model writes Python from this brief.',
        ),
      title: z.string().optional(),
      providerHint: z.enum(['claude', 'openai']).optional(),
    }),
    execute: async (args) => {
      const req: ArtifactRequest = {
        kind: 'document',
        conversationId,
        filename: args.filename,
        format: args.format,
        prompt: args.prompt,
        title: args.title,
        providerHint: args.providerHint,
      };
      return await artifacts.create(req).then(toolResultMessage);
    },
  });

  const audioArtifactTool = tool({
    description:
      'Generate AI-spoken audio (TTS) via OpenAI. Use this when the user asks for narration, voiceover, or to "read this out loud". Output is an audio file (mp3 by default). Briefly mention "AI-generated audio" in your reply.',
    inputSchema: z.object({
      text: z.string().min(1).describe('Exact text to be spoken.'),
      filename: z.string().optional(),
      voice: z.string().optional(),
      instructions: z.string().optional(),
      format: z.enum(['mp3', 'wav', 'opus', 'aac', 'flac']).optional(),
      title: z.string().optional(),
    }),
    execute: async (args) => {
      const filename = args.filename ?? `narration.${args.format ?? 'mp3'}`;
      const req: ArtifactRequest = {
        kind: 'audio',
        conversationId,
        filename,
        text: args.text,
        voice: args.voice,
        instructions: args.instructions,
        format: args.format,
        title: args.title,
      };
      return await artifacts.create(req).then(toolResultMessage);
    },
  });

  const videoArtifactTool = tool({
    description:
      'Generate a short AI video via the OpenAI Videos API (Sora 2). Experimental and slated for deprecation in 2026 — only use when the user explicitly asks for a video. Output is an .mp4 file.',
    inputSchema: z.object({
      prompt: z.string().min(1),
      filename: z.string().optional(),
      seconds: z.number().int().min(1).max(20).optional(),
      size: z.string().optional(),
      title: z.string().optional(),
    }),
    execute: async (args) => {
      const filename = args.filename ?? 'clip.mp4';
      const req: ArtifactRequest = {
        kind: 'video',
        conversationId,
        filename,
        prompt: args.prompt,
        seconds: args.seconds,
        size: args.size,
        title: args.title,
      };
      return await artifacts.create(req).then(toolResultMessage);
    },
  });

  const out: Record<string, unknown> = {
    create_text_artifact: textArtifactTool,
  };
  if (hasAnthropic || hasOpenAi) {
    out.create_document_artifact = documentArtifactTool;
  }
  if (hasOpenAi) {
    out.create_audio_artifact = audioArtifactTool;
  }
  if (hasOpenAi && settings.artifacts?.videoEnabled === true) {
    out.create_video_artifact = videoArtifactTool;
  }
  return out;
}

function toolResultMessage(result: ArtifactResult) {
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      provider: result.provider,
      message: `Artifact generation failed: ${result.error}`,
    };
  }
  return {
    ok: true,
    artifactId: result.artifactId,
    attachmentId: result.attachmentId,
    nodeId: result.nodeId,
    knowledgeBasePath: result.knowledgeBasePath,
    filename: result.filename,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    provider: result.provider,
    message: `Saved "${result.filename}" (${formatBytes(result.sizeBytes)}) via ${result.provider}.`,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
