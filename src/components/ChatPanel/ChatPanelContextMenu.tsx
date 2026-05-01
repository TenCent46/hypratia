import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import {
  AppContextMenuItem as Item,
  AppContextMenuSeparator as Separator,
} from '../ContextMenu/AppContextMenuItem';

export type ChatPanelContextMenuProps = {
  x: number;
  y: number;
  panelState?: 'shown' | 'hidden';
  onShow?: () => void;
  onHide?: () => void;
  onClose: () => void;
};

export function ChatPanelContextMenu({
  x,
  y,
  panelState = 'shown',
  onShow,
  onHide,
  onClose,
}: ChatPanelContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  const chatTabsAutoHide = useStore(
    (s) => s.settings.chatTabsAutoHide ?? false,
  );
  const chatTabsInSidebar = useStore(
    (s) => s.settings.chatTabsInSidebar ?? true,
  );
  const recentlyClosedCount = useStore(
    (s) => (s.settings.recentlyClosedConversations ?? []).length,
  );
  const setChatTabsAutoHide = useStore((s) => s.setChatTabsAutoHide);
  const setChatTabsInSidebar = useStore((s) => s.setChatTabsInSidebar);
  const reopenLastClosed = useStore((s) => s.reopenLastClosedConversation);
  const createConversation = useStore((s) => s.createConversation);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const createProject = useStore((s) => s.createProject);
  const setConversationProject = useStore((s) => s.setConversationProject);
  const lastConversationId = useStore((s) => s.settings.lastConversationId);

  // Reposition to stay on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width + pad > window.innerWidth) {
      nx = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (ny + rect.height + pad > window.innerHeight) {
      ny = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [x, y, pos.x, pos.y]);

  // Outside click + Escape close.
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function newChatTab() {
    const id = createConversation('Untitled');
    setActiveConversation(id);
    onClose();
  }

  function reopenClosedTab() {
    const id = reopenLastClosed();
    if (id) setActiveConversation(id);
    onClose();
  }

  function newGroup() {
    const projectId = createProject('New group');
    if (lastConversationId) setConversationProject(lastConversationId, projectId);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="app-context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item onClick={newChatTab} label="New Chat Tab" shortcut="⌘N" />
      <Item
        onClick={reopenClosedTab}
        label="Reopen Closed Chat Tab"
        shortcut="⇧⌘T"
        disabled={recentlyClosedCount === 0}
      />
      <Separator />
      <Item onClick={newGroup} label="New Group" />
      <Separator />
      <Item
        onClick={() => {
          onShow?.();
          onClose();
        }}
        label="Show Chat"
        checked={panelState === 'shown'}
      />
      <Item
        onClick={() => {
          onHide?.();
          onClose();
        }}
        label="Hide Chat"
        checked={panelState === 'hidden'}
      />
      <Separator />
      <Item
        onClick={() => {
          setChatTabsInSidebar(!chatTabsInSidebar);
          onClose();
        }}
        label="Show Tabs in Sidebar"
        checked={chatTabsInSidebar}
      />
      <Item
        onClick={() => {
          setChatTabsAutoHide(!chatTabsAutoHide);
          onClose();
        }}
        label="Auto-Hide Tabs"
        checked={chatTabsAutoHide}
      />
    </div>
  );
}

