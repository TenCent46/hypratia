import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type MenuId =
  | 'app:preferences'
  | 'file:new-chat'
  | 'file:new-project'
  | 'file:open-folder'
  | 'file:toggle-auto-save'
  | 'file:detach-chat'
  | 'file:detach-canvas'
  | 'chat:new-window'
  | 'canvas:new-window'
  | 'canvas:open-tree-window'
  | 'view:show-chat'
  | 'view:hide-chat'
  | 'view:show-canvas'
  | 'view:hide-canvas'
  | 'view:show-sidebar'
  | 'view:hide-sidebar'
  | 'view:show-all-panels'
  | 'view:toggle-tabs-autohide'
  | 'view:mode-current'
  | 'view:mode-global'
  | 'help:shortcuts';

export async function onMenuEvent(
  handler: (id: MenuId) => void,
): Promise<UnlistenFn> {
  return listen<string>('menu', (event) => {
    handler(event.payload as MenuId);
  });
}

/**
 * Push a check state into a registered macOS menu item. Silently swallows
 * failures (e.g. running outside Tauri or before the Rust side has the menu
 * built) so the UI never blocks on menu sync.
 */
export async function setMenuCheck(id: MenuId, checked: boolean): Promise<void> {
  try {
    await invoke('set_menu_check', { id, checked });
  } catch {
    // ignore — menu may not be ready yet, or we're in a non-Tauri build
  }
}
