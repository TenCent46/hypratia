export const STORAGE_FILES = {
  conversations: 'conversations.json',
  messages: 'messages.json',
  nodes: 'nodes.json',
  edges: 'edges.json',
  settings: 'settings.json',
  attachments: 'attachments.json',
  projects: 'projects.json',
} as const;

export type StorageFile = (typeof STORAGE_FILES)[keyof typeof STORAGE_FILES];
