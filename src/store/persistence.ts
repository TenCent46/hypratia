import { storage, STORAGE_FILES } from '../services/storage';
type StorageKey = (typeof STORAGE_FILES)[keyof typeof STORAGE_FILES];
import { broadcast, onBroadcast } from '../services/window';
import type {
  Attachment,
  CanvasNode,
  Conversation,
  Edge,
  Message,
  Project,
  Settings,
} from '../types';
import { useStore } from './index';
import { syncConversationMirror } from '../services/knowledge/conversationMarkdownMirror';

let applyingRemote = false;

type SliceName =
  | 'conversations'
  | 'messages'
  | 'nodes'
  | 'edges'
  | 'settings'
  | 'attachments'
  | 'projects';

function debounce<T>(fn: (v: T) => void, ms: number): (v: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (v) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(v), ms);
  };
}

const DEBOUNCE_MS = 300;

async function safeLoad<T>(key: StorageKey, fallback: T): Promise<T> {
  try {
    return await storage.loadJson<T>(key, fallback);
  } catch (err) {
    console.warn(`load ${key} failed; using fallback`, err);
    return fallback;
  }
}

export async function hydrateAndWire(): Promise<void> {
  const [
    conversations,
    messages,
    nodes,
    edges,
    settings,
    attachments,
    projects,
  ] = await Promise.all([
    safeLoad<Conversation[]>(STORAGE_FILES.conversations, []),
    safeLoad<Message[]>(STORAGE_FILES.messages, []),
    safeLoad<CanvasNode[]>(STORAGE_FILES.nodes, []),
    safeLoad<Edge[]>(STORAGE_FILES.edges, []),
    safeLoad<Settings>(STORAGE_FILES.settings, {
      schemaVersion: 1,
      viewportByConversation: {},
      theme: 'light',
      providers: {},
    }),
    safeLoad<Attachment[]>(STORAGE_FILES.attachments, []),
    safeLoad<Project[]>(STORAGE_FILES.projects, []),
  ]);

  useStore.getState().hydrate({
    conversations,
    messages,
    nodes,
    edges,
    settings,
    attachments,
    projects,
  });

  const saveConversations = debounce<Conversation[]>(
    (v) => storage.saveJson(STORAGE_FILES.conversations, v),
    DEBOUNCE_MS,
  );
  const saveMessages = debounce<Message[]>(
    (v) => storage.saveJson(STORAGE_FILES.messages, v),
    DEBOUNCE_MS,
  );
  const saveNodes = debounce<CanvasNode[]>(
    (v) => storage.saveJson(STORAGE_FILES.nodes, v),
    DEBOUNCE_MS,
  );
  const saveEdges = debounce<Edge[]>(
    (v) => storage.saveJson(STORAGE_FILES.edges, v),
    DEBOUNCE_MS,
  );
  const saveSettings = debounce<Settings>(
    (v) => storage.saveJson(STORAGE_FILES.settings, v),
    DEBOUNCE_MS,
  );
  const saveAttachments = debounce<Attachment[]>(
    (v) => storage.saveJson(STORAGE_FILES.attachments, v),
    DEBOUNCE_MS,
  );
  const saveProjects = debounce<Project[]>(
    (v) => storage.saveJson(STORAGE_FILES.projects, v),
    DEBOUNCE_MS,
  );

  function maybeBroadcast<T>(name: SliceName, value: T) {
    if (applyingRemote) return;
    void broadcast({
      kind: 'store-patch',
      data: { slice: name, value },
    });
  }

  useStore.subscribe((s) => s.conversations, (v) => {
    saveConversations(v);
    maybeBroadcast('conversations', v);
  });
  useStore.subscribe((s) => s.messages, (v) => {
    saveMessages(v);
    maybeBroadcast('messages', v);
  });
  useStore.subscribe((s) => s.nodes, (v) => {
    saveNodes(v);
    maybeBroadcast('nodes', v);
  });
  useStore.subscribe((s) => s.edges, (v) => {
    saveEdges(v);
    maybeBroadcast('edges', v);
  });
  useStore.subscribe((s) => s.settings, (v) => {
    saveSettings(v);
    maybeBroadcast('settings', v);
  });
  useStore.subscribe((s) => s.attachments, (v) => {
    saveAttachments(v);
    maybeBroadcast('attachments', v);
  });
  useStore.subscribe((s) => s.projects, (v) => {
    saveProjects(v);
    maybeBroadcast('projects', v);
    scheduleMirror();
  });

  // Mirror chat history (JSON source of truth) into Markdown files inside
  // the Knowledge Base root. Fire-and-forget: errors surface as a
  // CustomEvent so the UI can react without blocking the save path. See
  // docs/specs/15-knowledge-base-chat-history-mirror.md.
  const MIRROR_DEBOUNCE_MS = 700;
  let mirrorTimer: ReturnType<typeof setTimeout> | undefined;
  let mirrorPending = false;
  let mirrorRunning = false;
  function scheduleMirror() {
    if (applyingRemote) return;
    if (mirrorTimer) clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(runMirror, MIRROR_DEBOUNCE_MS);
  }
  async function runMirror() {
    if (mirrorRunning) {
      mirrorPending = true;
      return;
    }
    mirrorRunning = true;
    try {
      const s = useStore.getState();
      const result = await syncConversationMirror({
        conversations: s.conversations,
        messages: s.messages,
        projects: s.projects,
        markdownStorageDir: s.settings.markdownStorageDir,
      });
      if (result.errors.length > 0) {
        console.warn('mirror sync had errors', result.errors);
      }
      window.dispatchEvent(
        new CustomEvent('mc:knowledge-sync', { detail: result }),
      );
      window.dispatchEvent(new CustomEvent('mc:knowledge-tree-refresh'));
    } catch (err) {
      console.warn('mirror sync failed', err);
      window.dispatchEvent(
        new CustomEvent('mc:knowledge-sync', {
          detail: { error: String(err) },
        }),
      );
    } finally {
      mirrorRunning = false;
      if (mirrorPending) {
        mirrorPending = false;
        scheduleMirror();
      }
    }
  }
  useStore.subscribe((s) => s.conversations, () => scheduleMirror());
  useStore.subscribe((s) => s.messages, () => scheduleMirror());
  // Manual "Sync now" trigger from the Knowledge Base header. Bypasses the
  // debounce so the user gets immediate feedback.
  window.addEventListener('mc:knowledge-sync-request', () => {
    if (mirrorTimer) clearTimeout(mirrorTimer);
    void runMirror();
  });
  // Initial pass after hydrate so the mirror exists for already-stored chats.
  scheduleMirror();

  // Listen for store patches from sibling windows.
  void onBroadcast((payload) => {
    if (payload.kind !== 'store-patch') return;
    const data = payload.data as { slice?: SliceName; value?: unknown };
    if (!data?.slice) return;
    applyingRemote = true;
    try {
      // Zustand's set is exposed via setState
      const setState = useStore.setState;
      switch (data.slice) {
        case 'conversations':
          setState({ conversations: data.value as Conversation[] });
          break;
        case 'messages':
          setState({ messages: data.value as Message[] });
          break;
        case 'nodes':
          setState({ nodes: data.value as CanvasNode[] });
          break;
        case 'edges':
          setState({ edges: data.value as Edge[] });
          break;
        case 'settings':
          setState({ settings: data.value as Settings });
          break;
        case 'attachments':
          setState({ attachments: data.value as Attachment[] });
          break;
        case 'projects':
          setState({ projects: data.value as Project[] });
          break;
      }
    } finally {
      // Defer the unflag so the subscribe firing from setState sees applyingRemote=true
      Promise.resolve().then(() => {
        applyingRemote = false;
      });
    }
  });
}
