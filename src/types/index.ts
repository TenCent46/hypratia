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

export type CanvasNodeKind =
  | 'markdown'
  | 'image'
  | 'pdf'
  | 'artifact'
  | 'theme';

/**
 * Sub-classification stored on a `theme`-kind node via the `themeKind:<v>` tag.
 * - `theme` is a parent root for an ask cluster.
 * - `ask` is a user message converted into a child node.
 * - `insight` / `decision` are user-pinned assistant replies.
 */
export type ThemeKind = 'theme' | 'ask' | 'insight' | 'decision';

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
  /**
   * Conversation-map linkage. For `theme`-kind nodes: the root node's id (or
   * its own id for a theme root). Lets siblings under the same theme cluster.
   */
  themeId?: ID;
  /** 1 (low) … 5 (high). Drives the importance dot on theme nodes. */
  importance?: 1 | 2 | 3 | 4 | 5;
  createdAt: string;
  updatedAt: string;
};

export type EdgeKind = 'parent' | 'related';

export type Edge = {
  id: ID;
  sourceNodeId: ID;
  targetNodeId: ID;
  label?: string;
  /** Conversation-map edge taxonomy. Untyped edges keep legacy rendering. */
  kind?: EdgeKind;
  createdAt: string;
};

export type Viewport = { x: number; y: number; zoom: number };

export type Theme =
  | 'light'
  | 'dark'
  | 'sepia'
  | 'high-contrast'
  | 'white'
  | 'violet';

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

export type AttachmentStorageRoot = 'vault' | 'appData' | 'external';

export type Attachment = {
  id: ID;
  kind: 'image' | 'pdf' | 'audio' | 'video' | 'file';
  filename: string;
  /**
   * Where `relPath` is rooted. Records written before this field existed
   * are loaded as 'appData' (see hydrate path in store/persistence.ts).
   *   'vault'    → relative to the resolved Markdown vault root
   *   'appData'  → relative to appDataDir() (legacy)
   *   'external' → reserved; not yet emitted
   */
  storageRoot: AttachmentStorageRoot;
  relPath: string;
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
   * Conversation ids hidden from the inline chat tab bar (the "×" button
   * on a tab). Hiding is non-destructive — the chat history stays in the
   * library, the conversation is still listed in the sidebar, and
   * activating it (from the sidebar or command palette) restores its tab.
   */
  hiddenChatTabIds?: ID[];
  /**
   * Artifact generation pipeline preferences. See
   * docs/specs/17-artifact-generation-pipeline.md.
   */
  artifacts?: ArtifactSettings;
  /**
   * Knowledge Base editor mode. Default `live-preview`. See spec 21.
   */
  editorMode?: EditorMode;
  /**
   * Markdown editor auto save. Default true; users can opt out from Settings
   * or the macOS File menu.
   */
  markdownAutoSave?: boolean;
  /**
   * When true, conversations that are not assigned to a project are not
   * mirrored into the Knowledge Base. Project conversations still mirror.
   */
  incognitoUnprojectedChats?: boolean;
  /**
   * Set to `true` after the user clicks "Don't show again" on the
   * "this message is already on the canvas" notification. Suppresses
   * the toast on subsequent duplicate drops; the message is still not
   * re-added (the duplicate is silently ignored).
   */
  suppressDuplicateChatNodeWarning?: boolean;
  /**
   * Canvas wheel behavior. `pan` (default) makes wheel scroll/pan the
   * canvas with Cmd/Ctrl-wheel and pinch zooming. `zoom` makes plain
   * wheel zoom the canvas (Figma-like). Toggle with the S keyboard
   * shortcut. See spec 32.
   */
  canvasWheelMode?: 'pan' | 'zoom';
  /**
   * Conversation-map theme classifier. `auto` (default) uses the LLM
   * when an API key is configured, falling back to heuristics
   * otherwise. `heuristic` and `llm` force a single mode. See spec 32.
   */
  themesClassifier?: 'auto' | 'heuristic' | 'llm';
  /**
   * Body-text font size (px) for canvas markdown nodes. Bulk control —
   * scales node body, inline editor, and proportionally adjusts title /
   * inline-code via calc(). Default 13.
   */
  canvasFontSize?: number;
  /**
   * Auto night theme. When enabled, the active theme is overridden to
   * `nightModeTheme` between `nightModeStart` and `nightModeEnd`
   * (HH:mm in local time, the window may wrap midnight). The user's
   * day theme (`settings.theme`) is preserved and re-applied outside
   * the night window so toggling off restores it. Default false.
   */
  nightModeAuto?: boolean;
  nightModeTheme?: Theme;
  nightModeStart?: string;
  nightModeEnd?: string;
  /**
   * UI language. Two-letter ISO code (one of `SUPPORTED_LANGUAGES` from
   * `src/i18n`). Unset = follow OS locale on first launch.
   */
  language?: string;
};

export const CANVAS_FONT_SIZE_DEFAULT = 13;
export const CANVAS_FONT_SIZE_MIN = 8;
export const CANVAS_FONT_SIZE_MAX = 32;

export const NIGHT_MODE_DEFAULT_THEME: Theme = 'dark';
export const NIGHT_MODE_DEFAULT_START = '19:00';
export const NIGHT_MODE_DEFAULT_END = '07:00';

/**
 * Whether `now` falls inside the night window. Both bounds are inclusive
 * of the start minute and exclusive of the end minute. Windows that wrap
 * midnight (e.g. 19:00–07:00) are handled by OR-ing the two halves.
 */
export function isInNightWindow(
  now: Date,
  start: string,
  end: string,
): boolean {
  const parse = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
    return h * 60 + m;
  };
  const startMin = parse(start);
  const endMin = parse(end);
  if (startMin < 0 || endMin < 0 || startMin === endMin) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (startMin < endMin) return minutes >= startMin && minutes < endMin;
  return minutes >= startMin || minutes < endMin;
}

/**
 * Knowledge Base editor mode.
 *
 * The legacy enum included `source` (raw markdown view) and `reading`
 * (rendered HTML view). Both were removed when Live Preview became the
 * only editor; the alias is kept for backwards compatibility with
 * persisted Settings and event payloads — code may still hand us those
 * strings, but they are coerced to `live-preview` at the consumer.
 */
export type EditorMode = 'live-preview';
export type LegacyEditorMode = 'live-preview' | 'source' | 'reading';

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
