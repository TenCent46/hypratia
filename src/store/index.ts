import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Attachment,
  CanvasNode,
  Conversation,
  ConversationKind,
  Edge,
  EditorMode,
  ID,
  Message,
  MessageRole,
  ModelRef,
  Project,
  ProviderConfig,
  ProviderId,
  Settings,
  Theme,
  Viewport,
} from '../types';
import type { ArtifactUsageRecord } from '../services/artifacts';
import { newId } from '../lib/ids';
import { now } from '../lib/time';

const defaultSettings: Settings = {
  schemaVersion: 1,
  viewportByConversation: {},
  theme: 'light',
  providers: {},
  canvasWheelMode: 'pan',
  themesClassifier: 'auto',
  markdownAutoSave: true,
  incognitoUnprojectedChats: false,
};

export type HydrationData = {
  conversations: Conversation[];
  messages: Message[];
  nodes: CanvasNode[];
  edges: Edge[];
  settings: Settings;
  attachments: Attachment[];
  projects: Project[];
};

export type ViewMode = 'current' | 'global';
export type RightTab = 'chat' | 'inspect';
export type CanvasTool = 'select' | 'hand';

type UI = {
  selectedNodeId: ID | null;
  selectedNodeIds: ID[];
  selectedEdgeIds: ID[];
  activeRightTab: RightTab;
  viewMode: ViewMode;
  canvasTool: CanvasTool;
  searchOpen: boolean;
  settingsOpen: boolean;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  pdfViewerAttachmentId: ID | null;
  quickCaptureOpen: boolean;
  graphImportOpen: boolean;
  workspaceConfigOpen: boolean;
  detachedEditorNodeId: ID | null;
  /** Node currently being edited inline on the canvas; null when none. */
  editingNodeId: ID | null;
  aiPalette: { open: boolean; selection: string; origin: string | null } | null;
  sidebarCollapsed: boolean;
  expandedProjectIds: ID[];
  /** Projects whose nodes are shown in Global map. */
  globalVisibleProjectIds: ID[];
  /** Standalone (no-project) conversations shown in Global map. */
  globalVisibleConversationIds: ID[];
};

type State = {
  hydrated: boolean;
  conversations: Conversation[];
  messages: Message[];
  nodes: CanvasNode[];
  edges: Edge[];
  attachments: Attachment[];
  projects: Project[];
  settings: Settings;
  /**
   * Ring buffer of artifact-generation usage records. In-memory only —
   * cleared on app restart. Cap: 200 entries (newest first).
   */
  artifactUsage: ArtifactUsageRecord[];
  ui: UI;

  hydrate: (data: HydrationData) => void;

  createProject: (name?: string, emoji?: string) => ID;
  renameProject: (id: ID, name: string) => void;
  setProjectEmoji: (id: ID, emoji: string | undefined) => void;
  setProjectSystemPrompt: (id: ID, prompt: string | undefined) => void;
  removeProject: (id: ID, opts?: { deleteChats?: boolean }) => void;
  setConversationProject: (conversationId: ID, projectId: ID | null) => void;
  toggleProjectExpanded: (id: ID) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setEditingNode: (id: ID | null) => void;
  toggleProjectVisible: (id: ID) => void;
  toggleConversationVisible: (id: ID) => void;
  setAllProjectsVisible: (visible: boolean) => void;
  setCanvasTool: (tool: CanvasTool) => void;
  setCanvasWheelMode: (mode: 'pan' | 'zoom') => void;
  setThemesClassifier: (mode: 'auto' | 'heuristic' | 'llm') => void;

  createConversation: (title?: string, projectId?: ID) => ID;
  ensureConversation: () => ID;
  setActiveConversation: (id: ID) => void;
  renameConversation: (id: ID, title: string) => void;
  removeConversation: (id: ID) => void;
  /**
   * Hide a conversation from the inline chat tab bar. Non-destructive —
   * the chat history stays in the library; activating it (from the sidebar
   * or command palette) restores the tab via `setActiveConversation`.
   */
  hideChatTab: (id: ID) => void;
  /** Reveal a hidden tab without activating it. */
  showChatTab: (id: ID) => void;
  markConversationKind: (id: ID, kind: ConversationKind) => void;

  addMessage: (
    conversationId: ID,
    role: MessageRole,
    content: string,
    attachmentIds?: ID[],
    contextSummary?: Message['contextSummary'],
  ) => Message;
  addStreamingAssistantMessage: (conversationId: ID, model: ModelRef) => Message;
  appendMessageContent: (id: ID, delta: string) => void;
  finalizeMessage: (id: ID, patch?: Partial<Omit<Message, 'id' | 'conversationId'>>) => void;
  errorMessage: (id: ID, errorMessage: string) => void;
  removeMessage: (id: ID) => void;
  setConversationModel: (id: ID, model: ModelRef | undefined) => void;
  setConversationSystemPrompt: (id: ID, prompt: string | undefined) => void;
  setConversationThinking: (
    id: ID,
    thinking:
      | { enabled: boolean; budgetTokens?: number }
      | undefined,
  ) => void;
  setConversationReasoning: (
    id: ID,
    effort: 'low' | 'medium' | 'high' | undefined,
  ) => void;
  addConversationUsage: (
    id: ID,
    usage: { input: number; output: number },
  ) => void;

  addNode: (input: Omit<CanvasNode, 'id' | 'createdAt' | 'updatedAt'>) => CanvasNode;
  updateNodePosition: (id: ID, position: { x: number; y: number }) => void;
  updateNodeSize: (id: ID, size: { width: number; height: number }) => void;
  updateNode: (id: ID, patch: Partial<Omit<CanvasNode, 'id'>>) => void;
  removeNode: (id: ID) => void;

  addEdge: (input: Omit<Edge, 'id' | 'createdAt'>) => Edge;
  removeEdge: (id: ID) => void;

  addAttachment: (att: Attachment) => void;
  removeAttachment: (id: ID) => void;

  setViewport: (conversationId: ID, viewport: Viewport) => void;
  setObsidianVault: (path: string) => void;
  setMarkdownStorageDir: (path: string | undefined) => void;
  setChatTabsAutoHide: (autoHide: boolean) => void;
  setChatTabsInSidebar: (inSidebar: boolean) => void;
  reopenLastClosedConversation: () => ID | null;
  setWorkspaceName: (name: string | undefined) => void;
  setInboxConversationId: (id: ID) => void;
  setDailyNotesFolder: (folder: string) => void;
  setDailyNoteTemplate: (path: string | undefined) => void;
  setTemplatesFolder: (folder: string) => void;
  dismissOnboarding: () => void;
  setTheme: (theme: Theme) => void;
  setProvider: (id: ProviderId, patch: Partial<ProviderConfig>) => void;
  removeProvider: (id: ProviderId) => void;
  setDefaultModel: (model: ModelRef | undefined) => void;
  setSystemPrompt: (prompt: string | undefined) => void;
  setEditorMode: (mode: EditorMode) => void;
  setMarkdownAutoSave: (enabled: boolean) => void;
  setIncognitoUnprojectedChats: (enabled: boolean) => void;
  setSuppressDuplicateChatNodeWarning: (enabled: boolean) => void;
  setArtifactSettings: (
    patch: Partial<NonNullable<Settings['artifacts']>>,
  ) => void;
  recordArtifactUsage: (record: ArtifactUsageRecord) => void;

  selectNode: (id: ID | null) => void;
  setCanvasSelection: (nodeIds: ID[], edgeIds: ID[]) => void;
  clearCanvasSelection: () => void;
  setActiveRightTab: (tab: RightTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setPdfViewer: (attachmentId: ID | null) => void;
  setQuickCaptureOpen: (open: boolean) => void;
  setGraphImportOpen: (open: boolean) => void;
  setWorkspaceConfigOpen: (open: boolean) => void;
  setDetachedEditorNodeId: (id: ID | null) => void;
  openAiPalette: (selection: string, origin: string | null) => void;
  closeAiPalette: () => void;
};

const defaultUI: UI = {
  selectedNodeId: null,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  activeRightTab: 'chat',
  viewMode: 'current',
  canvasTool: 'select',
  searchOpen: false,
  settingsOpen: false,
  commandOpen: false,
  shortcutsOpen: false,
  pdfViewerAttachmentId: null,
  quickCaptureOpen: false,
  graphImportOpen: false,
  workspaceConfigOpen: false,
  detachedEditorNodeId: null,
  editingNodeId: null,
  aiPalette: null,
  sidebarCollapsed: false,
  expandedProjectIds: [],
  globalVisibleProjectIds: [],
  globalVisibleConversationIds: [],
};

export const useStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    hydrated: false,
    conversations: [],
    messages: [],
    nodes: [],
    edges: [],
    attachments: [],
    projects: [],
    settings: defaultSettings,
    artifactUsage: [],
    ui: defaultUI,

    hydrate: (data) =>
      set({
        conversations: data.conversations,
        messages: data.messages,
        nodes: data.nodes,
        edges: data.edges,
        attachments: data.attachments,
        projects: data.projects,
        settings: { ...defaultSettings, ...data.settings },
        hydrated: true,
      }),

    createProject: (name = 'New project', emoji) => {
      const id = newId();
      const t = now();
      const p: Project = {
        id,
        name,
        ...(emoji ? { emoji } : {}),
        createdAt: t,
        updatedAt: t,
      };
      set((s) => ({
        projects: [...s.projects, p],
        ui: {
          ...s.ui,
          expandedProjectIds: [...s.ui.expandedProjectIds, id],
        },
      }));
      return id;
    },

    renameProject: (id, name) =>
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id ? { ...p, name, updatedAt: now() } : p,
        ),
      })),

    setProjectEmoji: (id, emoji) =>
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id
            ? { ...p, emoji: emoji || undefined, updatedAt: now() }
            : p,
        ),
      })),

    setProjectSystemPrompt: (id, prompt) =>
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id
            ? { ...p, systemPrompt: prompt || undefined, updatedAt: now() }
            : p,
        ),
      })),

    removeProject: (id, opts) =>
      set((s) => {
        const projects = s.projects.filter((p) => p.id !== id);
        if (opts?.deleteChats) {
          const removedConvIds = new Set(
            s.conversations.filter((c) => c.projectId === id).map((c) => c.id),
          );
          const conversations = s.conversations.filter(
            (c) => !removedConvIds.has(c.id),
          );
          const messages = s.messages.filter(
            (m) => !removedConvIds.has(m.conversationId),
          );
          const removedNodeIds = new Set(
            s.nodes
              .filter((n) => removedConvIds.has(n.conversationId))
              .map((n) => n.id),
          );
          const nodes = s.nodes.filter(
            (n) => !removedConvIds.has(n.conversationId),
          );
          const edges = s.edges.filter(
            (e) =>
              !removedNodeIds.has(e.sourceNodeId) &&
              !removedNodeIds.has(e.targetNodeId),
          );
          const lastId = removedConvIds.has(s.settings.lastConversationId ?? '')
            ? conversations[0]?.id
            : s.settings.lastConversationId;
          return {
            projects,
            conversations,
            messages,
            nodes,
            edges,
            settings: { ...s.settings, lastConversationId: lastId },
            ui: {
              ...s.ui,
              expandedProjectIds: s.ui.expandedProjectIds.filter(
                (pid) => pid !== id,
              ),
            },
          };
        }
        return {
          projects,
          conversations: s.conversations.map((c) =>
            c.projectId === id ? { ...c, projectId: undefined } : c,
          ),
          ui: {
            ...s.ui,
            expandedProjectIds: s.ui.expandedProjectIds.filter(
              (pid) => pid !== id,
            ),
          },
        };
      }),

    setConversationProject: (conversationId, projectId) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                projectId: projectId ?? undefined,
                updatedAt: now(),
              }
            : c,
        ),
        ui:
          projectId && !s.ui.expandedProjectIds.includes(projectId)
            ? {
                ...s.ui,
                expandedProjectIds: [...s.ui.expandedProjectIds, projectId],
              }
            : s.ui,
      })),

    toggleProjectExpanded: (id) =>
      set((s) => ({
        ui: {
          ...s.ui,
          expandedProjectIds: s.ui.expandedProjectIds.includes(id)
            ? s.ui.expandedProjectIds.filter((pid) => pid !== id)
            : [...s.ui.expandedProjectIds, id],
        },
      })),

    setSidebarCollapsed: (collapsed) =>
      set((s) => ({ ui: { ...s.ui, sidebarCollapsed: collapsed } })),

    toggleProjectVisible: (id) =>
      set((s) => ({
        ui: {
          ...s.ui,
          globalVisibleProjectIds: s.ui.globalVisibleProjectIds.includes(id)
            ? s.ui.globalVisibleProjectIds.filter((p) => p !== id)
            : [...s.ui.globalVisibleProjectIds, id],
        },
      })),

    toggleConversationVisible: (id) =>
      set((s) => ({
        ui: {
          ...s.ui,
          globalVisibleConversationIds:
            s.ui.globalVisibleConversationIds.includes(id)
              ? s.ui.globalVisibleConversationIds.filter((c) => c !== id)
              : [...s.ui.globalVisibleConversationIds, id],
        },
      })),

    setAllProjectsVisible: (visible) =>
      set((s) => ({
        ui: {
          ...s.ui,
          globalVisibleProjectIds: visible ? s.projects.map((p) => p.id) : [],
          globalVisibleConversationIds: visible
            ? s.conversations.filter((c) => !c.projectId).map((c) => c.id)
            : [],
        },
      })),

    setCanvasTool: (tool) =>
      set((s) => ({
        ui: {
          ...s.ui,
          canvasTool: tool,
        },
      })),

    setCanvasWheelMode: (mode) =>
      set((s) => ({
        settings: { ...s.settings, canvasWheelMode: mode },
      })),

    setThemesClassifier: (mode) =>
      set((s) => ({
        settings: { ...s.settings, themesClassifier: mode },
      })),

    createConversation: (title = 'Untitled', projectId) => {
      const id = newId();
      const t = now();
      const c: Conversation = {
        id,
        title,
        createdAt: t,
        updatedAt: t,
        messageIds: [],
        ...(projectId ? { projectId } : {}),
      };
      set((s) => ({
        conversations: [...s.conversations, c],
        settings: { ...s.settings, lastConversationId: id },
      }));
      return id;
    },

    ensureConversation: () => {
      const { conversations, settings } = get();
      const last = settings.lastConversationId;
      if (last && conversations.some((c) => c.id === last)) return last;
      return get().createConversation();
    },

    setActiveConversation: (id) =>
      set((s) => {
        // Activating a hidden tab brings it back into the inline tab bar.
        // Without this, clicking a chat in the sidebar that the user had
        // previously "×"'d would leave them with the chat panel showing
        // its messages but no corresponding tab — confusing and easy to
        // mistake for a phantom state.
        const prevHidden = s.settings.hiddenChatTabIds ?? [];
        const nextHidden = prevHidden.includes(id)
          ? prevHidden.filter((x) => x !== id)
          : prevHidden;
        return {
          settings: {
            ...s.settings,
            lastConversationId: id,
            ...(nextHidden !== prevHidden
              ? { hiddenChatTabIds: nextHidden }
              : null),
          },
          ui: {
            ...s.ui,
            selectedNodeId: null,
            selectedNodeIds: [],
            selectedEdgeIds: [],
            activeRightTab: 'chat',
          },
        };
      }),

    hideChatTab: (id) =>
      set((s) => {
        const prev = s.settings.hiddenChatTabIds ?? [];
        if (prev.includes(id)) return {};
        // If the user is hiding the active tab, switch to another visible
        // one in the same scope so the chat panel doesn't keep rendering
        // a tab that's no longer in the strip.
        const closing = s.conversations.find((c) => c.id === id);
        const nextHidden = [...prev, id];
        let nextLastId = s.settings.lastConversationId;
        if (s.settings.lastConversationId === id) {
          const scopeId = closing?.projectId;
          const candidate = s.conversations.find(
            (c) =>
              c.id !== id &&
              !nextHidden.includes(c.id) &&
              (scopeId ? c.projectId === scopeId : !c.projectId),
          );
          nextLastId = candidate?.id;
        }
        return {
          settings: {
            ...s.settings,
            hiddenChatTabIds: nextHidden,
            lastConversationId: nextLastId,
          },
        };
      }),

    showChatTab: (id) =>
      set((s) => {
        const prev = s.settings.hiddenChatTabIds ?? [];
        if (!prev.includes(id)) return {};
        return {
          settings: {
            ...s.settings,
            hiddenChatTabIds: prev.filter((x) => x !== id),
          },
        };
      }),

    renameConversation: (id, title) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, title, updatedAt: now() } : c,
        ),
      })),

    markConversationKind: (id, kind) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, kind, updatedAt: now() } : c,
        ),
      })),

    removeConversation: (id) =>
      set((s) => {
        const closing = s.conversations.find((c) => c.id === id);
        const remainingConvs = s.conversations.filter((c) => c.id !== id);
        const remainingMsgs = s.messages.filter((m) => m.conversationId !== id);
        const removedNodeIds = new Set(
          s.nodes.filter((n) => n.conversationId === id).map((n) => n.id),
        );
        const remainingNodes = s.nodes.filter((n) => n.conversationId !== id);
        const remainingEdges = s.edges.filter(
          (e) =>
            !removedNodeIds.has(e.sourceNodeId) &&
            !removedNodeIds.has(e.targetNodeId),
        );
        const lastId =
          s.settings.lastConversationId === id
            ? remainingConvs[0]?.id
            : s.settings.lastConversationId;
        const { [id]: _removed, ...remainingViewports } =
          s.settings.viewportByConversation ?? {};
        const inboxId =
          s.settings.inboxConversationId === id
            ? undefined
            : s.settings.inboxConversationId;
        // Push the closed conversation onto the ring buffer (cap 10).
        // The ring buffer only stores what's needed to re-create a conversation
        // shell; the messages/nodes are already gone by design — restoring is
        // best-effort and the user is notified via the menu copy.
        const recentRing = s.settings.recentlyClosedConversations ?? [];
        const nextRing = closing
          ? [
              {
                id: closing.id,
                title: closing.title,
                projectId: closing.projectId,
                closedAt: now(),
              },
              ...recentRing.filter((r) => r.id !== closing.id),
            ].slice(0, 10)
          : recentRing;
        return {
          conversations: remainingConvs,
          messages: remainingMsgs,
          nodes: remainingNodes,
          edges: remainingEdges,
          settings: {
            ...s.settings,
            lastConversationId: lastId,
            viewportByConversation: remainingViewports,
            inboxConversationId: inboxId,
            recentlyClosedConversations: nextRing,
            hiddenChatTabIds: (s.settings.hiddenChatTabIds ?? []).filter(
              (x) => x !== id,
            ),
          },
        };
      }),

    addMessage: (conversationId, role, content, attachmentIds, contextSummary) => {
      const id = newId();
      const t = now();
      const m: Message = {
        id,
        conversationId,
        role,
        content,
        ...(contextSummary ? { contextSummary } : {}),
        createdAt: t,
        ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
      };
      set((s) => ({
        messages: [...s.messages, m],
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, messageIds: [...c.messageIds, id], updatedAt: t }
            : c,
        ),
      }));
      return m;
    },

    addStreamingAssistantMessage: (conversationId, model) => {
      const id = newId();
      const t = now();
      const m: Message = {
        id,
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: t,
        streaming: true,
        model,
      };
      set((s) => ({
        messages: [...s.messages, m],
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, messageIds: [...c.messageIds, id], updatedAt: t }
            : c,
        ),
      }));
      return m;
    },

    appendMessageContent: (id, delta) =>
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, content: m.content + delta } : m,
        ),
      })),

    finalizeMessage: (id, patch) =>
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, ...patch, streaming: false } : m,
        ),
      })),

    errorMessage: (id, errorMessage) =>
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, streaming: false, errored: true, errorMessage } : m,
        ),
      })),

    removeMessage: (id) =>
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== id),
        conversations: s.conversations.map((c) => ({
          ...c,
          messageIds: c.messageIds.filter((mid) => mid !== id),
        })),
      })),

    setConversationModel: (id, model) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, modelOverride: model, updatedAt: now() } : c,
        ),
      })),

    setConversationSystemPrompt: (id, prompt) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, systemPrompt: prompt, updatedAt: now() } : c,
        ),
      })),

    setConversationThinking: (id, thinking) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id
            ? {
                ...c,
                thinking: thinking ?? undefined,
                updatedAt: now(),
              }
            : c,
        ),
      })),

    setConversationReasoning: (id, effort) =>
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id
            ? {
                ...c,
                reasoningEffort: effort ?? undefined,
                updatedAt: now(),
              }
            : c,
        ),
      })),

    addConversationUsage: (id, usage) =>
      set((s) => ({
        conversations: s.conversations.map((c) => {
          if (c.id !== id) return c;
          const cur = c.tokenUsage ?? { input: 0, output: 0 };
          return {
            ...c,
            tokenUsage: {
              input: cur.input + usage.input,
              output: cur.output + usage.output,
            },
          };
        }),
      })),

    addNode: (input) => {
      const id = newId();
      const t = now();
      const n: CanvasNode = { ...input, id, createdAt: t, updatedAt: t };
      set((s) => ({ nodes: [...s.nodes, n] }));
      return n;
    },

    updateNodePosition: (id, position) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, position, updatedAt: now() } : n,
        ),
      })),

    updateNodeSize: (id, size) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id
            ? { ...n, width: size.width, height: size.height, updatedAt: now() }
            : n,
        ),
      })),

    updateNode: (id, patch) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: now() } : n,
        ),
      })),

    removeNode: (id) =>
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter(
          (e) => e.sourceNodeId !== id && e.targetNodeId !== id,
        ),
        ui: {
          ...s.ui,
          selectedNodeId: s.ui.selectedNodeId === id ? null : s.ui.selectedNodeId,
          selectedNodeIds: s.ui.selectedNodeIds.filter((nid) => nid !== id),
          selectedEdgeIds: s.ui.selectedEdgeIds.filter((eid) =>
            s.edges.some(
              (e) =>
                e.id === eid && e.sourceNodeId !== id && e.targetNodeId !== id,
            ),
          ),
        },
      })),

    addEdge: (input) => {
      const id = newId();
      const t = now();
      const e: Edge = { ...input, id, createdAt: t };
      set((s) => ({ edges: [...s.edges, e] }));
      return e;
    },

    removeEdge: (id) =>
      set((s) => ({
        edges: s.edges.filter((e) => e.id !== id),
        ui: {
          ...s.ui,
          selectedEdgeIds: s.ui.selectedEdgeIds.filter((eid) => eid !== id),
        },
      })),

    addAttachment: (att) =>
      set((s) => ({ attachments: [...s.attachments, att] })),

    removeAttachment: (id) =>
      set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),

    setViewport: (conversationId, viewport) =>
      set((s) => ({
        settings: {
          ...s.settings,
          viewportByConversation: {
            ...(s.settings.viewportByConversation ?? {}),
            [conversationId]: viewport,
          },
        },
      })),

    setObsidianVault: (path) =>
      set((s) => ({ settings: { ...s.settings, obsidianVaultPath: path } })),

    setMarkdownStorageDir: (path) =>
      set((s) => ({
        settings: { ...s.settings, markdownStorageDir: path },
      })),

    setArtifactSettings: (patch) =>
      set((s) => ({
        settings: {
          ...s.settings,
          artifacts: { ...(s.settings.artifacts ?? {}), ...patch },
        },
      })),

    recordArtifactUsage: (record) =>
      set((s) => {
        const next = [record, ...s.artifactUsage];
        if (next.length > 200) next.length = 200;
        return { artifactUsage: next };
      }),

    setChatTabsAutoHide: (autoHide) =>
      set((s) => ({
        settings: { ...s.settings, chatTabsAutoHide: autoHide },
      })),

    setChatTabsInSidebar: (inSidebar) =>
      set((s) => ({
        settings: { ...s.settings, chatTabsInSidebar: inSidebar },
      })),

    reopenLastClosedConversation: () => {
      const s = get();
      const ring = s.settings.recentlyClosedConversations ?? [];
      if (ring.length === 0) return null;
      const [head, ...rest] = ring;
      // Source data (messages/nodes) was discarded on close; restore the
      // conversation shell with the same title + project so the user has
      // something resumable.
      const id = newId();
      const t = now();
      const conv: Conversation = {
        id,
        title: head.title,
        createdAt: t,
        updatedAt: t,
        messageIds: [],
        ...(head.projectId ? { projectId: head.projectId } : {}),
      };
      set((cur) => ({
        conversations: [...cur.conversations, conv],
        settings: {
          ...cur.settings,
          lastConversationId: id,
          recentlyClosedConversations: rest,
        },
      }));
      return id;
    },

    setWorkspaceName: (name) =>
      set((s) => ({ settings: { ...s.settings, workspaceName: name } })),

    setInboxConversationId: (id) =>
      set((s) => ({ settings: { ...s.settings, inboxConversationId: id } })),

    setDailyNotesFolder: (folder) =>
      set((s) => ({ settings: { ...s.settings, dailyNotesFolder: folder } })),

    setDailyNoteTemplate: (path) =>
      set((s) => ({ settings: { ...s.settings, dailyNoteTemplate: path } })),

    setTemplatesFolder: (folder) =>
      set((s) => ({ settings: { ...s.settings, templatesFolder: folder } })),

    dismissOnboarding: () =>
      set((s) => ({ settings: { ...s.settings, onboardingDismissed: true } })),

    setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),

    setProvider: (id, patch) =>
      set((s) => {
        const existing = s.settings.providers[id];
        const next: ProviderConfig = {
          id,
          enabled: existing?.enabled ?? true,
          ...existing,
          ...patch,
        };
        return {
          settings: {
            ...s.settings,
            providers: { ...s.settings.providers, [id]: next },
          },
        };
      }),

    removeProvider: (id) =>
      set((s) => {
        const { [id]: _gone, ...rest } = s.settings.providers;
        return { settings: { ...s.settings, providers: rest } };
      }),

    setDefaultModel: (model) =>
      set((s) => ({ settings: { ...s.settings, defaultModel: model } })),

    setSystemPrompt: (prompt) =>
      set((s) => ({ settings: { ...s.settings, systemPrompt: prompt } })),

    setEditorMode: (mode) =>
      set((s) => ({ settings: { ...s.settings, editorMode: mode } })),

    setMarkdownAutoSave: (enabled) =>
      set((s) => ({ settings: { ...s.settings, markdownAutoSave: enabled } })),

    setIncognitoUnprojectedChats: (enabled) =>
      set((s) => ({
        settings: { ...s.settings, incognitoUnprojectedChats: enabled },
      })),

    setSuppressDuplicateChatNodeWarning: (enabled) =>
      set((s) => ({
        settings: {
          ...s.settings,
          suppressDuplicateChatNodeWarning: enabled,
        },
      })),

    selectNode: (id) =>
      set((s) => ({
        ui: {
          ...s.ui,
          selectedNodeId: id,
          selectedNodeIds: id ? [id] : [],
          selectedEdgeIds: [],
          activeRightTab: id ? 'inspect' : s.ui.activeRightTab,
        },
      })),

    setCanvasSelection: (nodeIds, edgeIds) =>
      set((s) => ({
        ui: {
          ...s.ui,
          selectedNodeId: nodeIds[0] ?? null,
          selectedNodeIds: Array.from(new Set(nodeIds)),
          selectedEdgeIds: Array.from(new Set(edgeIds)),
          activeRightTab:
            nodeIds.length > 0 ? 'inspect' : s.ui.activeRightTab,
        },
      })),

    clearCanvasSelection: () =>
      set((s) => ({
        ui: {
          ...s.ui,
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeIds: [],
        },
      })),

    setActiveRightTab: (tab) =>
      set((s) => ({ ui: { ...s.ui, activeRightTab: tab } })),

    setViewMode: (mode) => set((s) => ({ ui: { ...s.ui, viewMode: mode } })),

    setSearchOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, searchOpen: open } })),

    setSettingsOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, settingsOpen: open } })),

    setCommandOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, commandOpen: open } })),

    setShortcutsOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, shortcutsOpen: open } })),

    setPdfViewer: (attachmentId) =>
      set((s) => ({ ui: { ...s.ui, pdfViewerAttachmentId: attachmentId } })),

    setQuickCaptureOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, quickCaptureOpen: open } })),

    setGraphImportOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, graphImportOpen: open } })),

    setWorkspaceConfigOpen: (open) =>
      set((s) => ({ ui: { ...s.ui, workspaceConfigOpen: open } })),

    setDetachedEditorNodeId: (id) =>
      set((s) => ({ ui: { ...s.ui, detachedEditorNodeId: id } })),

    setEditingNode: (id) =>
      set((s) => ({ ui: { ...s.ui, editingNodeId: id } })),

    openAiPalette: (selection, origin) =>
      set((s) => ({
        ui: { ...s.ui, aiPalette: { open: true, selection, origin } },
      })),

    closeAiPalette: () =>
      set((s) => ({ ui: { ...s.ui, aiPalette: null } })),
  })),
);
