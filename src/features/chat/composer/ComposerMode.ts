// Composer mode owned by the chat input. Exported separately so the menu
// component can talk about modes without pulling in the streaming hook.
export type ComposerMode = 'chat' | 'search' | 'deep_search';

export const COMPOSER_MODE_LABEL: Record<ComposerMode, string> = {
  chat: 'Chat',
  search: 'Search',
  deep_search: 'Deep Search',
};
