import { useCallback, useRef, useState } from 'react';
import { useStore } from '../../store';
import { chat } from '../../services/llm';
import { attachments as attachmentsService } from '../../services/attachments';
import { drainPendingArtifacts } from '../../services/artifacts';
import { autoTitleConversation } from '../../services/chat/autoTitle';
import { readProjectKnowledgeContext } from '../../services/knowledge/projectKnowledge';
import { pickClassifier } from '../../services/themes';
import type {
  ChatMessage,
  ChatPart,
  ReasoningEffort,
} from '../../services/llm';
import { getModelMeta } from '../../services/llm';
import type { Attachment, ID, ModelRef } from '../../types';

import {
  modeSystemPrompt,
  webSearchAvailableFor,
  type ChatMode,
} from '../../services/llm/searchMode';

export type { ChatMode };
export type SendContextOptions = {
  systemContext?: string;
  contextSummary?: {
    fileCount: number;
    edgeCount: number;
    fileNames: string[];
  };
};

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

const PROJECT_KNOWLEDGE_TOOL_POLICY = [
  'Project knowledge tools:',
  '- knowledge_search searches raw project documents that have been extracted into the local processed/ index.',
  '- knowledge_read_document_range reads exact canonical page or sentence ranges after a search result identifies a documentId.',
  '- For project-specific factual claims, document/PDF/source questions, filenames, quotes, sections, or uncertain project facts, use knowledge_search before answering.',
  '- Cite retrieved evidence compactly with the citation strings returned by the tools.',
  '- If retrieval is weak or empty after a reasonable broadened query, say the answer was not found in the project knowledge.',
].join('\n');

/**
 * Pick a free position for a brand-new theme root in the given conversation.
 * Lays roots out left-to-right in a column-like row; each row starts at y=200
 * so theme roots stay above their ask children.
 */
function placeNewThemeRoot(
  existing: ReadonlyArray<{
    conversationId: ID;
    kind?: string;
    position: { x: number; y: number };
    tags: string[];
  }>,
  conversationId: ID,
): { x: number; y: number } {
  const roots = existing.filter(
    (n) =>
      n.conversationId === conversationId &&
      n.kind === 'theme' &&
      (n.tags ?? []).includes('themeKind:theme'),
  );
  if (roots.length === 0) return { x: 200, y: 200 };
  const rightmost = roots.reduce((acc, n) =>
    n.position.x > acc.position.x ? n : acc,
  );
  return { x: rightmost.position.x + 280, y: 200 };
}

/**
 * Place an ask child below the lowest existing child of the given theme; if
 * the theme has no children yet, drop it 120px under the theme root.
 */
function placeAskChild(
  existing: ReadonlyArray<{
    id: ID;
    themeId?: ID;
    position: { x: number; y: number };
  }>,
  themeRoot: { id: ID; position: { x: number; y: number } },
): { x: number; y: number } {
  const siblings = existing.filter((n) => n.themeId === themeRoot.id);
  if (siblings.length === 0) {
    return { x: themeRoot.position.x, y: themeRoot.position.y + 120 };
  }
  const lowest = siblings.reduce((acc, n) =>
    n.position.y > acc.position.y ? n : acc,
  );
  return { x: themeRoot.position.x, y: lowest.position.y + 90 };
}

/**
 * Conversation-map mint: classify the user message, ensure a theme root
 * exists, and add an `ask` child node + parent edge. Best-effort; never
 * throws. See spec 32.
 */
async function mintAskNode(
  messageId: ID,
  conversationId: ID,
  message: string,
  model: ModelRef | undefined,
): Promise<void> {
  const state = useStore.getState();
  const settings = state.settings;
  const allNodes = state.nodes;
  const themeRoots = allNodes.filter(
    (n) =>
      n.conversationId === conversationId &&
      n.kind === 'theme' &&
      (n.tags ?? []).includes('themeKind:theme'),
  );
  const classifier = await pickClassifier(settings, model);
  const classified = await classifier.classify({
    conversationId,
    message,
    recentThemes: themeRoots.slice(-8).map((n) => ({
      id: n.id,
      title: n.title,
      contentMarkdown: n.contentMarkdown,
      tags: n.tags,
    })),
    model,
  });

  // Resolve the theme root.
  let themeRootId: ID;
  let themeRootNode = classified.themeId
    ? allNodes.find((n) => n.id === classified.themeId)
    : undefined;
  if (!themeRootNode) {
    const pos = placeNewThemeRoot(allNodes, conversationId);
    themeRootNode = useStore.getState().addNode({
      conversationId,
      kind: 'theme',
      title: classified.themeTitle,
      contentMarkdown: classified.themeTitle,
      position: pos,
      tags: ['themeKind:theme'],
      importance: classified.importance,
    });
    themeRootId = themeRootNode.id;
    // The root's themeId is its own id so children can cluster around it.
    useStore.getState().updateNode(themeRootId, { themeId: themeRootId });
  } else {
    themeRootId = themeRootNode.id;
  }

  // Place the ask under the theme root.
  const askPos = placeAskChild(
    useStore.getState().nodes,
    { id: themeRootId, position: themeRootNode.position },
  );
  const askNode = useStore.getState().addNode({
    conversationId,
    kind: 'theme',
    title: classified.askSummary,
    contentMarkdown: classified.askSummary,
    sourceMessageId: messageId,
    position: askPos,
    tags: [`themeKind:${classified.themeKind}`],
    themeId: themeRootId,
    importance: classified.importance,
  });
  useStore.getState().addEdge({
    sourceNodeId: themeRootId,
    targetNodeId: askNode.id,
    kind: 'parent',
  });
}

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
        webSearch?: boolean;
      },
    ) => {
      const placeholder = addStreaming(conversationId, model);
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      // Coalesce text chunks into one store update per animation frame.
      // Models stream 30–60 deltas a second; calling `append()` on every
      // delta flushes a Zustand update + React reconcile + DOM layout for
      // each one, which blocks the main thread enough to make scrolling
      // feel choppy. Buffering gives the browser time to satisfy the
      // user's pointer events between paints.
      let pending = '';
      let frameHandle: number | null = null;
      const flushPending = () => {
        frameHandle = null;
        if (!pending) return;
        const next = pending;
        pending = '';
        append(placeholder.id, next);
      };
      const schedule = () => {
        if (frameHandle !== null) return;
        frameHandle = requestAnimationFrame(flushPending);
      };
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
            webSearch: opts?.webSearch,
          },
          controller.signal,
        )) {
          if (controller.signal.aborted) break;
          if ('type' in chunk && chunk.type === 'usage') {
            usage = chunk.usage;
            continue;
          }
          if ('text' in chunk) {
            pending += chunk.text;
            schedule();
          }
        }
        // Drain whatever was buffered before finalising — without this
        // the very last frame of text could be dropped when the loop
        // exits faster than the rAF timer fires.
        if (frameHandle !== null) {
          cancelAnimationFrame(frameHandle);
          frameHandle = null;
        }
        if (pending) {
          append(placeholder.id, pending);
          pending = '';
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
        void autoTitleConversation(conversationId).catch((err) => {
          console.warn('[chat] auto title failed', err);
        });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        errorMsg(placeholder.id, m);
        void autoTitleConversation(conversationId).catch((titleErr) => {
          console.warn('[chat] auto title failed', titleErr);
        });
      } finally {
        if (frameHandle !== null) {
          cancelAnimationFrame(frameHandle);
          frameHandle = null;
        }
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
      const userMsg = addMessage(
        conversationId,
        'user',
        trimmed,
        attachmentIds,
        context?.contextSummary,
      );
      // Conversation-map: classify the ask and mint a node + edge in the
      // background so the chat send isn't blocked.
      void mintAskNode(userMsg.id, conversationId, trimmed, model).catch(
        (err) => {
          console.warn('[themes] mintAskNode failed', err);
        },
      );

      if (!model) {
        // Journal-mode: no provider configured; just stop here.
        addMessage(
          conversationId,
          'system',
          '_(No AI provider configured. Add one in Settings to enable streaming responses.)_',
        );
        void autoTitleConversation(conversationId).catch((err) => {
          console.warn('[chat] auto title failed', err);
        });
        return;
      }

      const sysPrompt = conv?.systemPrompt ?? settings.systemPrompt;
      const webSearchActive =
        (mode === 'search' || mode === 'deep_search') &&
        webSearchAvailableFor(model);
      const modePrompt = modeSystemPrompt(mode, webSearchActive);
      const projectContext = await readProjectKnowledgeContext(conv?.projectId);
      const history: ChatMessage[] = [];
      if (sysPrompt) history.push({ role: 'system', content: sysPrompt });
      if (projectContext) history.push({ role: 'system', content: projectContext });
      history.push({ role: 'system', content: PROJECT_KNOWLEDGE_TOOL_POLICY });
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
        webSearch: webSearchActive,
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
      const webSearchActive =
        (mode === 'search' || mode === 'deep_search') &&
        webSearchAvailableFor(model);
      const modePrompt = modeSystemPrompt(mode, webSearchActive);
      const projectContext = await readProjectKnowledgeContext(conv?.projectId);
      if (sysPrompt) history.push({ role: 'system', content: sysPrompt });
      if (projectContext) history.push({ role: 'system', content: projectContext });
      history.push({ role: 'system', content: PROJECT_KNOWLEDGE_TOOL_POLICY });
      if (modePrompt) history.push({ role: 'system', content: modePrompt });
      history.push({ role: 'system', content: ARTIFACT_TOOL_POLICY });
      for (const m of prior.slice(-30)) {
        if (m.role === 'system') continue;
        history.push({ role: m.role, content: m.content });
      }
      if (!history.some((m) => m.role === 'user')) return;
      await streamAssistant(assistant.conversationId, model, history, {
        webSearch: webSearchActive,
      });
    },
    [messages, conversations, settings, streamAssistant],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { send, regenerate, abort, streaming };
}
