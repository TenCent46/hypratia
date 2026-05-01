export type ID = string;

export type ConversationKind = 'standard' | 'inbox' | 'daily';

export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

export type ThinkingConfig = {
  enabled: boolean;
  budgetTokens?: number;
};

export type Conversation = {
  id: ID;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageIds: ID[];
  modelOverride?: ModelRef;
  systemPrompt?: string;
  tokenUsage?: { input: number; output: number };
  kind?: ConversationKind;
  projectId?: ID;
  thinking?: ThinkingConfig;
  reasoningEffort?: ReasoningEffortLevel;
};

export type Project = {
  id: ID;
  name: string;
  emoji?: string;
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type Message = {
  id: ID;
  conversationId: ID;
  role: MessageRole;
  content: string;
  contextSummary?: {
    fileCount: number;
    edgeCount: number;
    fileNames: string[];
  };
  createdAt: string;
  // streaming bookkeeping
  streaming?: boolean;
  errored?: boolean;
  errorMessage?: string;
  // model that produced an assistant message
  model?: ModelRef;
  usage?: { input: number; output: number };
  attachmentIds?: ID[];
};

export type CanvasNodeKind = 'markdown' | 'image' | 'pdf' | 'artifact';

export type CanvasSelectionMarker = {
  markerId: ID;
  sourceNodeId: ID;
  sourceMdPath?: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  answerNodeId: ID;
  question: string;
  createdAt: string;
};

export type CanvasNode = {
  id: ID;
  conversationId: ID;
  kind?: CanvasNodeKind;
  title: string;
  contentMarkdown: string;
  sourceMessageId?: ID;
  mdPath?: string;
  mdSectionId?: string;
  sourceMdId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  tags: string[];
  embedding?: number[];
  attachmentIds?: ID[];
  pdfRef?: PdfRef;
  /** User-editable frontmatter (free-form keys merged into exported YAML). */
  frontmatter?: Record<string, unknown>;
  selectionMarkers?: CanvasSelectionMarker[];
  createdAt: string;
  updatedAt: string;
};

export type Edge = {
  id: ID;
  sourceNodeId: ID;
  targetNodeId: ID;
  label?: string;
  createdAt: string;
};

export type Viewport = { x: number; y: number; zoom: number };

export type Theme = 'light' | 'dark' | 'sepia' | 'high-contrast';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'mistral'
  | 'google'
  | 'ollama'
  | 'openai-compatible';

export type ProviderConfig = {
  id: ProviderId;
  enabled: boolean;
  baseUrl?: string;
  defaultModel?: string;
  lastVerifiedAt?: string;
  /** User-added or API-fetched models that augment the built-in defaultModels list. */
  customModels?: string[];
  /** Models that should be hidden from the picker even though they're in defaultModels. */
  hiddenModels?: string[];
  /** When customModels were last refreshed from the provider API. */
  modelsRefreshedAt?: string;
};

export type ModelRef = {
  provider: ProviderId;
  model: string;
};

export type Attachment = {
  id: ID;
  kind: 'image' | 'pdf' | 'audio' | 'video' | 'file';
  filename: string;
  relPath: string; // attachments/YYYY-MM/<file>
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  pageCount?: number;
  createdAt: string;
};

export type PdfRef = {
  attachmentId: ID;
  page: number;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  text: string;
};

export type Settings = {
  workspaceName?: string;
  obsidianVaultPath?: string;
  /**
   * Folder where chat history exports as Markdown. Optional — when unset the
   * app falls back to `<appData>/LLM-Conversations`. Set via the "Local
   * Markdown Storage" settings section, typically pointed at an Obsidian vault.
   */
  markdownStorageDir?: string;
  schemaVersion: number;
  lastConversationId?: ID;
  viewportByConversation?: Record<ID, Viewport>;
  theme: Theme;
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  defaultModel?: ModelRef;
  systemPrompt?: string;
  dailyNotesFolder?: string;
  dailyNoteTemplate?: string;
  templatesFolder?: string;
  quickCaptureShortcut?: string;
  inboxConversationId?: ID;
  onboardingDismissed?: boolean;
  /**
   * When true the right-pane tab strip renders in a compact mode (smaller
   * height + font). The chat panel itself stays visible. Persisted across
   * sessions. See docs/specs/05-chat-context-menu-tabs.md.
   */
  chatTabsAutoHide?: boolean;
  /**
   * Default true. When false, conversation tabs are hidden from the sidebar
   * and an inline horizontal tab strip renders above the chat panel instead.
   * Equivalent to Safari's "Show Tabs in Sidebar" toggle.
   */
  chatTabsInSidebar?: boolean;
  /**
   * Most recently closed conversations. Used by the chat-panel context menu
   * "Reopen Closed Chat Tab" action. Capped to the last 10 entries.
   */
  recentlyClosedConversations?: RecentlyClosedConversation[];
  /**
   * Artifact generation pipeline preferences. See
   * docs/specs/17-artifact-generation-pipeline.md.
   */
  artifacts?: ArtifactSettings;
  /**
   * Knowledge Base editor mode. Default `live-preview`. See spec 21.
   */
  editorMode?: EditorMode;
};

export type EditorMode = 'live-preview' | 'source' | 'reading';

export type ArtifactSettings = {
  documentProvider?: 'claude' | 'openai';
  ttsVoice?: string;
  ttsFormat?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac';
  mirrorTextToKnowledgeBase?: boolean;
  /**
   * Sora 2 video generation is deprecating in 2026; off by default. The
   * video tool is registered with the model only when this is true.
   */
  videoEnabled?: boolean;
};

export type RecentlyClosedConversation = {
  /** Original id; not reused on reopen. Kept only for reference. */
  id: ID;
  title: string;
  projectId?: ID;
  closedAt: string;
};
