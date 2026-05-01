import { useCallback, useRef, useState } from 'react';
import { useStore } from '../../store';
import { chat } from '../../services/llm';
import { attachments as attachmentsService } from '../../services/attachments';
import { drainPendingArtifacts } from '../../services/artifacts';
import type {
  ChatMessage,
  ChatPart,
  ReasoningEffort,
} from '../../services/llm';
import { getModelMeta } from '../../services/llm';
import type { Attachment, ID, ModelRef } from '../../types';

export type ChatMode = 'chat' | 'search' | 'deep_search';
export type SendContextOptions = {
  systemContext?: string;
  contextSummary?: {
    fileCount: number;
    edgeCount: number;
    fileNames: string[];
  };
};

function modeSystemPrompt(mode: ChatMode): string | null {
  if (mode === 'search') {
    return 'Search mode is selected. If live web search tools are unavailable in this local desktop build, say that clearly. Do not imply that you browsed the web or fabricate citations.';
  }
  if (mode === 'deep_search') {
    return 'Deep search mode is selected. Produce a structured research brief with research plan, key findings, uncertainties, and suggested source queries. If live web search tools are unavailable, say that clearly and do not fabricate citations.';
  }
  return null;
}

const ARTIFACT_TOOL_POLICY = [
  'Artifact tools (file generation):',
  '- When the user asks to create, save, export, download, or generate a document/file, call an artifact tool instead of returning the content inline.',
  '- create_text_artifact — Markdown / plain text / source code (.md, .txt, .py, .ts, .json, etc.). Always use this for ".md" output the user wants saved.',
  '- create_document_artifact — binary office/PDF formats (.docx, .pptx, .xlsx, .pdf). Pass a thorough brief in `prompt`; the provider sandbox writes the file. Never base64-encode or paste binary into chat.',
  '- create_audio_artifact — TTS narration (when available). Mention briefly that the audio is AI-generated.',
  '- create_video_artifact — only when video is enabled and the user asks for a video.',
  'After a successful tool call, give a short chat summary of what was generated; the file itself is already attached.',
  'Do not force file generation for short / conversational answers. Use tools only when the user clearly wants a file or the output is meaningfully better as a file.',
].join('\n');

async function buildUserContent(
  text: string,
  attachmentIds: ID[],
  attachments: Attachment[],
): Promise<string | ChatPart[]> {
  if (attachmentIds.length === 0) return text;

  const parts: ChatPart[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const id of attachmentIds) {
    const att = attachments.find((a) => a.id === id);
    if (!att) continue;
    try {
      const bytes = await attachmentsService.readBytes(att);
      if (att.kind === 'image') {
        parts.push({ type: 'image', image: bytes, mediaType: att.mimeType });
      } else {
        parts.push({
          type: 'file',
          data: bytes,
          mediaType: att.mimeType,
          filename: att.filename,
        });
      }
    } catch {
      // skip unreadable attachments
    }
  }
  if (parts.length === 0) return text;
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

export function useChatStream() {
  const conversations = useStore((s) => s.conversations);
  const messages = useStore((s) => s.messages);
  const storeAttachments = useStore((s) => s.attachments);
  const settings = useStore((s) => s.settings);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const addMessage = useStore((s) => s.addMessage);
  const addStreaming = useStore((s) => s.addStreamingAssistantMessage);
  const append = useStore((s) => s.appendMessageContent);
  const finalize = useStore((s) => s.finalizeMessage);
  const errorMsg = useStore((s) => s.errorMessage);

  const addUsage = useStore((s) => s.addConversationUsage);

  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);

  const streamAssistant = useCallback(
    async (
      conversationId: string,
      model: ModelRef,
      history: ChatMessage[],
      opts?: {
        thinking?: { enabled: boolean; budgetTokens?: number };
        reasoningEffort?: ReasoningEffort;
      },
    ) => {
      const placeholder = addStreaming(conversationId, model);
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      try {
        let usage: { input: number; output: number } | undefined;
        for await (const chunk of chat.stream(
          {
            provider: model.provider,
            model: model.model,
            messages: history,
            thinking: opts?.thinking,
            reasoningEffort: opts?.reasoningEffort,
            conversationId,
          },
          controller.signal,
        )) {
          if (controller.signal.aborted) break;
          if ('type' in chunk && chunk.type === 'usage') {
            usage = chunk.usage;
            continue;
          }
          if ('text' in chunk) append(placeholder.id, chunk.text);
        }
        if (controller.signal.aborted) {
          append(placeholder.id, '\n\n_(stopped)_');
        }
        const artifactIds = drainPendingArtifacts(conversationId);
        const patch: Partial<{
          usage: { input: number; output: number };
          attachmentIds: string[];
        }> = {};
        if (usage) patch.usage = usage;
        if (artifactIds.length > 0) patch.attachmentIds = artifactIds;
        finalize(
          placeholder.id,
          Object.keys(patch).length > 0 ? patch : undefined,
        );
        if (usage) addUsage(conversationId, usage);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        errorMsg(placeholder.id, m);
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addStreaming, append, finalize, addUsage, errorMsg],
  );

  const send = useCallback(
    async (
      text: string,
      mode: ChatMode = 'chat',
      attachmentIds: ID[] = [],
      context?: SendContextOptions,
    ) => {
      const trimmed = text.trim();
      if (!trimmed && attachmentIds.length === 0) return;
      const conversationId = ensureConversation();
      const conv = conversations.find((c) => c.id === conversationId);
      const model: ModelRef | undefined =
        conv?.modelOverride ?? settings.defaultModel;

      // Always log the user's message, even if no model is configured
      addMessage(
        conversationId,
        'user',
        trimmed,
        attachmentIds,
        context?.contextSummary,
      );

      if (!model) {
        // Journal-mode: no provider configured; just stop here.
        addMessage(
          conversationId,
          'system',
          '_(No AI provider configured. Add one in Settings to enable streaming responses.)_',
        );
        return;
      }

      const sysPrompt = conv?.systemPrompt ?? settings.systemPrompt;
      const modePrompt = modeSystemPrompt(mode);
      const history: ChatMessage[] = [];
      if (sysPrompt) history.push({ role: 'system', content: sysPrompt });
      if (modePrompt) history.push({ role: 'system', content: modePrompt });
      history.push({ role: 'system', content: ARTIFACT_TOOL_POLICY });
      if (context?.systemContext) {
        history.push({ role: 'system', content: context.systemContext });
      }
      // include the just-added user message
      const priorMessages = messages.filter(
        (m) => m.conversationId === conversationId && !m.errored,
      );
      // sliding window: last 30 turns (prior, excluding current outgoing)
      for (const m of priorMessages.slice(-29)) {
        if (m.role === 'system') continue;
        history.push({ role: m.role, content: m.content });
      }
      const userContent = await buildUserContent(
        trimmed,
        attachmentIds,
        storeAttachments,
      );
      history.push({ role: 'user', content: userContent });

      const meta = getModelMeta(model.provider, model.model);
      const useThinking =
        conv?.thinking?.enabled && meta?.capabilities?.includes('thinking');
      const reasoningEffort =
        meta?.capabilities?.includes('reasoning_effort')
          ? conv?.reasoningEffort
          : undefined;
      await streamAssistant(conversationId, model, history, {
        thinking: useThinking ? conv?.thinking : undefined,
        reasoningEffort,
      });
    },
    [
      conversations,
      messages,
      storeAttachments,
      settings,
      ensureConversation,
      addMessage,
      streamAssistant,
    ],
  );

  const regenerate = useCallback(
    async (assistantMessageId: string, mode: ChatMode = 'chat') => {
      const assistantIndex = messages.findIndex((m) => m.id === assistantMessageId);
      const assistant = messages[assistantIndex];
      if (!assistant || assistant.role !== 'assistant') return;
      const conv = conversations.find((c) => c.id === assistant.conversationId);
      const model = assistant.model ?? conv?.modelOverride ?? settings.defaultModel;
      if (!model) return;

      const prior = messages
        .slice(0, assistantIndex)
        .filter((m) => m.conversationId === assistant.conversationId && !m.errored);
      const history: ChatMessage[] = [];
      const sysPrompt = conv?.systemPrompt ?? settings.systemPrompt;
      const modePrompt = modeSystemPrompt(mode);
      if (sysPrompt) history.push({ role: 'system', content: sysPrompt });
      if (modePrompt) history.push({ role: 'system', content: modePrompt });
      history.push({ role: 'system', content: ARTIFACT_TOOL_POLICY });
      for (const m of prior.slice(-30)) {
        if (m.role === 'system') continue;
        history.push({ role: m.role, content: m.content });
      }
      if (!history.some((m) => m.role === 'user')) return;
      await streamAssistant(assistant.conversationId, model, history);
    },
    [messages, conversations, settings, streamAssistant],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { send, regenerate, abort, streaming };
}
