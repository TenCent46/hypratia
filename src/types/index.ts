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

/** Plan 51 — non-destructive view modes for assistant messages. */
export type LaconicView = 'original' | 'laconic' | 'outline' | 'actions';

/** Cached derived view of a message's content. Original is never overwritten. */
export type MessageDerivedView = {
  text: string;
  /** Engine that produced this view ('local' = free heuristics, 'cheap-llm' = L2). */
  engine: 'local' | 'cheap-llm';
  /** Bumps per release; cache invalidates when promptVersion no longer matches. */
  promptVersion: string;
  generatedAt: string;
};

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
  // --- Plan 51 — Laconic View / derivative views ---
  /** sha-256(content) truncated, used as cache key for derivative views. */
  contentHash?: string;
  views?: {
    laconic?: MessageDerivedView;
    outline?: MessageDerivedView;
    actions?: MessageDerivedView;
  };
  /** Per-message user choice, falls back to the conversation default. */
  preferredView?: LaconicView;
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
  /**
   * Conflict-detection metadata for Refresh from Vault. Records the
   * body hash both Hypratia and the vault agreed on at the last
   * successful sync. Refresh classifies an incoming file by comparing
   * its body hash against this baseline + the current store body
   * hash, then applies / skips / reports a conflict accordingly.
   *
   * Cleared once on first install (undefined). Set by Force Re-sync
   * Now and by Refresh from Vault when a `vault-changed-only` apply
   * succeeds. Untouched by canvas autosave (autosave is geometry-only
   * and never writes bodies).
   */
  syncMeta?: {
    lastSyncedBodyHash?: string;
    lastSyncedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type EdgeKind = 'parent' | 'related';

export type CostTier = 'L2' | 'L3';

/** A single LLM call's spend record (plan 49). */
export type CostRecord = {
  at: string;
  tier: CostTier;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
};

export type Budgets = {
  /** Hard cap per calendar month for L2 (cheap) calls. 0 disables the tier. */
  L2: number;
  /** Hard cap per calendar month for L3 (premium) calls. 0 disables the tier. */
  L3: number;
};

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

/**
 * Embedding provider identifier (plan/v1/31 Step 5). `'off'` disables
 * embedding-based scoring entirely; the IngestRouter falls back to its
 * pure-heuristic path. `'mock'` is the deterministic in-process provider
 * — useful for tests and for proving the seam is wired correctly. Real
 * providers (e.g. local ONNX MiniLM) extend this union.
 */
export type EmbeddingProviderId = 'off' | 'mock';

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
  /** Plan 49 — LLM spend ring buffer (last 13 months trimmed at month boundary). */
  costRecords?: CostRecord[];
  /** Plan 49 — per-tier monthly budget caps. Defaults: L2 $5, L3 $0. */
  budgets?: Budgets;
  /** Plan 53 — opt-in: watch `{vault}/Hypratia/.mailbox/incoming` for the
   *  Obsidian companion plugin's payloads. Off by default. */
  mailboxWatcherEnabled?: boolean;
  /** ISO timestamp of the last successful "Force re-sync now". UI uses
   *  this to render a "Last synced 3 min ago" indicator. */
  lastResyncAt?: string;
  /** ISO timestamp of the most recent successful canvas autosave write.
   *  Surfaced in Settings → Sync Doctor so users can verify autosave is
   *  alive ("Last canvas autosave: 12s ago") even when nothing visible has
   *  happened. Distinct from `lastResyncAt` because autosave is per-
   *  conversation and silent. */
  lastCanvasAutosaveAt?: string;
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
  /**
   * Model used by the canvas "Search with LLM" feature. Independent from
   * `defaultModel` so users can keep an expensive chat model active while
   * searching with a free/fast model (e.g. Groq llama-3.3-70b-versatile).
   * When unset, the modal falls back to Groq's first available model, then
   * to the active chat model.
   */
  llmSearchModel?: ModelRef;
  /**
   * Plan/v1/31 Step 5 — embedding provider for chat-ingest similarity
   * routing. `'off'` (default) keeps the IngestRouter on its pure-heuristic
   * path so users opt in explicitly. `'mock'` is the deterministic in-process
   * provider that ships today; it's not semantically accurate but proves
   * the wiring works. Real providers land in a follow-up plan.
   */
  embeddings?: { provider: EmbeddingProviderId };
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
