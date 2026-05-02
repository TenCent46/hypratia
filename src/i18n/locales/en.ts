/**
 * English source strings. Keep keys nested by surface (settings.tabs.x,
 * sidebar.x, chat.x, …) so translators can locate context. Values may use
 * i18next interpolation: `{{count}}`, `{{nodes}}`, etc.
 *
 * When you add a key here, replicate it across the other six locale files
 * — i18n.ts is configured with `fallbackLng: 'en'` so missing keys still
 * render the English source rather than the raw key.
 */
const en = {
  common: {
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    delete: 'Delete',
    copy: 'Copy',
    open: 'Open',
    edit: 'Edit',
    settings: 'Settings',
  },
  language: {
    label: 'Language',
    auto: 'Use system language',
    en: 'English',
    ja: '日本語',
    zh: '中文',
    de: 'Deutsch',
    fr: 'Français',
    ko: '한국어',
    es: 'Español',
    note: 'Switching is instant. Some untranslated labels stay in English.',
  },
  settings: {
    title: 'Settings',
    tabs: {
      providers: 'Providers & keys',
      usage: 'Usage & cost',
      appearance: 'Appearance',
      vault: 'Vault & data',
      workflow: 'Daily & templates',
      about: 'About',
    },
    appearance: {
      workspace: 'Workspace',
      workspaceName: 'Workspace name',
      theme: 'Theme',
      themeNote:
        'Theme applies instantly. Custom accent and brand themes are coming in v1.0.1.',
      autoNightTheme: 'Auto night theme',
      switchAtNight: 'Switch to a dark theme at night',
      nightModeNote:
        'Your selected theme above stays as the day theme; only the displayed appearance is overridden during the night window.',
      nightTheme: 'Night theme',
      startsAt: 'Starts at',
      endsAt: 'Ends at',
      themeDark: 'Dark',
      themeHighContrast: 'High contrast',
    },
    canvasMap: {
      title: 'Conversation map',
      description:
        'The canvas is a compact map of your chat history. Each ask becomes a node; clicking a node jumps the chat to the source message.',
      wheelLabel: 'Wheel behavior',
      wheelPan: 'Scroll / pan (Cmd-wheel zooms)',
      wheelZoom: 'Zoom (wheel zooms)',
      wheelHint: 'Toggle live with the S key. Pinch always zooms.',
      themesClassifierLabel: 'Theme classifier',
      themesClassifierAuto: 'Auto (LLM when a key is set, heuristic otherwise)',
      themesClassifierHeuristic: 'Heuristic only (offline)',
      themesClassifierLlm: 'LLM only',
      canvasFontSize: 'Canvas text size',
      canvasFontReset: 'Reset',
    },
  },
  sidebar: {
    chats: 'Chats',
    projects: 'Projects',
    addProject: 'New project',
    addChat: 'New chat',
    noChats: 'No chats yet',
    noProjects: 'No projects yet',
    defaultProject: 'No project',
  },
  chat: {
    placeholderReply: 'Reply…',
    placeholderStreaming: 'Streaming… ⌘⌫ to stop',
    stop: 'Stop',
    send: 'Send',
    composerActions: 'Composer actions',
    composerActionsTitle: 'Add files, skills, search…',
    empty: {
      start: 'Start a conversation.',
      pick: 'Pick a conversation in the sidebar.',
    },
  },
  canvas: {
    addNode: 'Add Node',
    paste: 'Paste',
    showCanvas: 'Show Canvas',
    hideCanvas: 'Hide Canvas',
    showChat: 'Show Chat',
    hideChat: 'Hide Chat',
    resetView: 'Reset View',
    fitAll: 'Fit All',
    fitSelection: 'Fit Selection',
    fitToCanvas: 'Fit to Canvas',
    selectTool: 'Select Tool',
    handTool: 'Hand Tool',
    cancel: 'Cancel',
    empty: {
      pickProject:
        'Pick a project or conversation in the panel to show its nodes.',
      dragMessage: 'Drag a message here.',
      startAnywhere: 'Start anywhere.',
    },
  },
  node: {
    openInEditor: 'Open in editor',
    copy: 'Copy',
    copyAsMarkdown: 'Copy as Markdown',
    openExternal: 'Open with default app',
    showInFinder: 'Show in Finder',
    moveTo: 'Move conversation to…',
    noProject: '(No project)',
    deleteCard: 'Delete card',
  },
  selection: {
    summary: '{{nodes}} notes, {{edges}} links',
    ask: 'Ask',
    search: 'Search',
    openMarkdown: 'Open Markdown',
    copyLinks: 'Copy Markdown Links',
    addLinks: 'Add Link Between Selected Notes',
    deleteLink: 'Delete Link',
    deleteLinks: 'Delete {{count}} Links',
    panes: 'Panes',
    toggleSidebar: 'Toggle Sidebar',
    toggleMarkdown: 'Toggle Markdown Editor',
    toggleCanvas: 'Toggle Canvas',
    toggleChat: 'Toggle Chat',
  },
  onboarding: {
    welcome: 'Welcome to Hypratia',
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    getStarted: 'Get started',
    intro:
      'On the right is a real chat. On the left is your spatial memory: drag thoughts onto the canvas, drop PDFs and images, highlight text inside a PDF to spawn a linked card.',
    introNote: 'Everything stays on your machine. You bring your own AI keys.',
    shortcutCommandPalette: 'command palette',
    shortcutSearch: 'search',
    shortcutAiPalette: 'AI palette on selection',
    shortcutDaily: "today's daily note",
    shortcutAll: 'all shortcuts',
    addProvider: 'Add an AI provider',
    addProviderHelp:
      'Optional — the app works as a journal without one. To enable streaming chat, add a key now or later.',
    openProviderSettings: 'Open Settings → Providers',
    pickVault: 'Pick your vault (optional)',
    pickVaultHelp:
      'When you export, conversations + nodes go into this folder as Markdown. Skip and your data stays only in app data.',
    notSet: '(not set)',
    change: 'Change…',
    choose: 'Choose folder…',
    firstConversation: 'First conversation',
    welcomeMessage:
      '_Welcome. Try ⌘P for the command palette, ⌘K to search, ⌘J on selected text for AI._',
  },
  commandPalette: {
    placeholder: 'Type a command…',
    noCommands: 'No commands.',
  },
  shortcuts: {
    title: 'Keyboard shortcuts',
  },
};

export default en;
export type Strings = typeof en;
