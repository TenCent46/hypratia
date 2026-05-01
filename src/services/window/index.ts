import { invoke } from '@tauri-apps/api/core';
import {
  emit,
  listen,
  type UnlistenFn,
} from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type WindowView = 'main' | 'chat' | 'canvas' | 'markdown';
export type LayoutPreset = 'main' | 'chatFocused' | 'canvasFocused';

export type WindowLifecycleEvent = {
  event: 'created' | 'focused' | 'closed';
  windowId: string;
  tabId: string | null;
  view: 'chat' | 'canvas';
};

export function getCurrentView(): WindowView {
  if (getInitialMarkdownPath()) return 'markdown';
  const preset = getInitialLayoutPreset();
  if (preset === 'chatFocused') return 'chat';
  if (preset === 'canvasFocused') return 'canvas';
  const url = new URL(window.location.href);
  const v = url.searchParams.get('view');
  if (v === 'chat' || v === 'canvas') return v;
  if (url.searchParams.get('windowId') && url.searchParams.get('chatId')) {
    return 'chat';
  }
  return 'main';
}

export function getInitialMarkdownPath(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get('markdownPath');
}

export function getInitialLayoutPreset(): LayoutPreset {
  const url = new URL(window.location.href);
  const preset = url.searchParams.get('layoutPreset');
  if (preset === 'chatFocused' || preset === 'canvasFocused') return preset;
  const legacy = url.searchParams.get('windowType') || url.searchParams.get('view');
  if (legacy === 'chat') return 'chatFocused';
  if (legacy === 'canvas') return 'canvasFocused';
  return 'main';
}

export function getInitialTabId(): string | null {
  const url = new URL(window.location.href);
  return (
    url.searchParams.get('chatId') ||
    url.searchParams.get('sourceTabId') ||
    url.searchParams.get('tabId')
  );
}

export function getInitialWindowId(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get('windowId');
}

export function getCurrentWindowLabel(): string {
  return getCurrentWindow().label;
}

/**
 * Detach a tab into a new fully-native macOS window. The frontend MUST NOT
 * call `new WebviewWindow()` directly — all window lifecycle is owned by
 * Rust. This function only signals intent and returns the new window id.
 *
 * @param tabId Conversation id to make active inside the detached window.
 */
export async function detachTabToWindow(tabId: string): Promise<string> {
  try {
    const windowId = await invoke<string>('detach_tab_to_window', {
      tabId,
      layoutPreset: 'chatFocused',
    });
    return windowId;
  } catch (err) {
    console.error('detachTabToWindow failed', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function detachViewToWindow(
  view: 'chat' | 'canvas',
  tabId?: string,
): Promise<string> {
  try {
    const layoutPreset = view === 'canvas' ? 'canvasFocused' : 'chatFocused';
    const payload = tabId
      ? { view, layoutPreset, tabId, sourceTabId: tabId, chatId: tabId }
      : { view, layoutPreset };
    const windowId = await invoke<string>('detach_tab_to_window', payload);
    return windowId;
  } catch (err) {
    console.error('detachViewToWindow failed', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Convenience for code paths that don't have a specific tab in mind. */
export async function openDetached(view: 'chat' | 'canvas'): Promise<string> {
  return detachViewToWindow(view);
}

export async function openChatWindow(chatId: string): Promise<string> {
  return detachTabToWindow(chatId);
}

export async function openCanvasWorkspaceWindow(chatId?: string): Promise<string> {
  return detachViewToWindow('canvas', chatId);
}

export async function openMarkdownEditorWindow(
  markdownPath: string,
  chatId?: string,
): Promise<string> {
  try {
    const payload = chatId
      ? {
          view: 'canvas',
          layoutPreset: 'canvasFocused',
          markdownPath,
          tabId: chatId,
          sourceTabId: chatId,
          chatId,
        }
      : {
          view: 'canvas',
          layoutPreset: 'canvasFocused',
          markdownPath,
        };
    return await invoke<string>('detach_tab_to_window', payload);
  } catch (err) {
    console.error('openMarkdownEditorWindow failed', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function focusDetached(label: string): Promise<void> {
  try {
    await invoke('focus_window', { label });
  } catch (err) {
    console.error('focusDetached failed', err);
  }
}

export async function listDetachedWindows(): Promise<Record<string, string>> {
  try {
    return await invoke<Record<string, string>>('list_detached_windows');
  } catch (err) {
    console.warn('list_detached_windows failed', err);
    return {};
  }
}

/** Subscribe to window lifecycle events emitted by the Rust side. */
export async function onWindowLifecycle(
  handler: (e: WindowLifecycleEvent) => void,
): Promise<UnlistenFn> {
  return listen<WindowLifecycleEvent>('window-lifecycle', (e) => {
    handler(e.payload);
  });
}

/* ----- cross-window broadcast (store sync, drag intent) ----- */

export type Broadcast =
  | { kind: 'store-patch'; data: unknown }
  | { kind: 'drag-message-start'; messageId: string }
  | { kind: 'drag-message-end'; messageId: string };

export type CrossWindowDragPayload = {
  id: string;
  type: 'chat-message';
  chatId: string;
  messageId?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

const BROADCAST_EVENT = 'mc:broadcast';

const SENDER_TAG = `${Math.random().toString(36).slice(2)}:${Date.now()}`;

export async function broadcast(payload: Broadcast): Promise<void> {
  await emit(BROADCAST_EVENT, { sender: SENDER_TAG, payload });
}

export async function onBroadcast(
  handler: (payload: Broadcast) => void,
): Promise<UnlistenFn> {
  return listen<{ sender: string; payload: Broadcast }>(
    BROADCAST_EVENT,
    (e) => {
      // Ignore our own emissions
      if (e.payload.sender === SENDER_TAG) return;
      handler(e.payload.payload);
    },
  );
}

export async function beginCrossWindowDrag(
  payload: CrossWindowDragPayload,
): Promise<string> {
  return invoke<string>('begin_cross_window_drag', { payload });
}

export async function resolveCrossWindowDrag(
  dragSessionId: string,
): Promise<CrossWindowDragPayload | null> {
  return invoke<CrossWindowDragPayload | null>('resolve_cross_window_drag', {
    dragSessionId,
  });
}

export async function cancelCrossWindowDrag(
  dragSessionId: string,
): Promise<void> {
  await invoke('cancel_cross_window_drag', { dragSessionId });
}
