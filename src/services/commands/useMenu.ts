import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { onMenuEvent, type MenuId } from '../menu';
import { openCanvasWorkspaceWindow, openChatWindow } from '../window';

export type LayoutControls = {
  focusCanvasPane: () => void;
  focusChatPane: () => void;
  showSidebar: () => void;
  hideSidebar: () => void;
  showCanvas: () => void;
  hideCanvas: () => void;
  showChat: () => void;
  hideChat: () => void;
  showMarkdown: () => void;
  hideMarkdown: () => void;
  showAllPanels: () => void;
};

/**
 * Listens to native menu events from Tauri and dispatches store actions or
 * layout-control callbacks. Stable across re-renders (uses a ref).
 */
export function useMenu(controls: LayoutControls): void {
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    onMenuEvent((id: MenuId) => {
      const s = useStore.getState();
      switch (id) {
        case 'app:preferences':
          s.setSettingsOpen(true);
          break;
        case 'file:new-chat': {
          const newId = s.createConversation('Untitled');
          s.setActiveConversation(newId);
          break;
        }
        case 'file:new-project': {
          s.createProject('New project');
          break;
        }
        case 'file:open-folder': {
          window.dispatchEvent(new CustomEvent('mc:knowledge-choose-folder'));
          break;
        }
        case 'file:detach-chat':
        case 'chat:new-window': {
          const chatId = s.settings.lastConversationId ?? s.createConversation('Untitled');
          s.setActiveConversation(chatId);
          void openChatWindow(chatId);
          controlsRef.current.focusCanvasPane();
          break;
        }
        case 'file:detach-canvas':
        case 'canvas:new-window': {
          const chatId = s.settings.lastConversationId ?? s.createConversation('Untitled');
          s.setActiveConversation(chatId);
          void openCanvasWorkspaceWindow(chatId);
          controlsRef.current.focusChatPane();
          break;
        }
        case 'view:show-chat':
          controlsRef.current.showChat();
          break;
        case 'view:hide-chat':
          controlsRef.current.hideChat();
          break;
        case 'view:show-canvas':
          controlsRef.current.showCanvas();
          break;
        case 'view:hide-canvas':
          controlsRef.current.hideCanvas();
          break;
        case 'view:show-sidebar':
          controlsRef.current.showSidebar();
          break;
        case 'view:hide-sidebar':
          controlsRef.current.hideSidebar();
          break;
        case 'view:show-all-panels':
          controlsRef.current.showAllPanels();
          break;
        case 'view:toggle-tabs-autohide': {
          const cur = s.settings.chatTabsAutoHide ?? false;
          s.setChatTabsAutoHide(!cur);
          break;
        }
        case 'view:mode-current':
          s.setViewMode('current');
          break;
        case 'view:mode-global':
          s.setViewMode('global');
          break;
        case 'help:shortcuts':
          s.setShortcutsOpen(true);
          break;
      }
    })
      .then((u) => {
        if (cancelled) {
          u();
        } else {
          unlistenFn = u;
        }
      })
      .catch((err) => {
        console.error('menu listener failed', err);
      });
    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);
}
