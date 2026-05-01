export type CommandSection =
  | 'Conversation'
  | 'Canvas'
  | 'AI'
  | 'Chat'
  | 'Editor'
  | 'Search'
  | 'View'
  | 'File'
  | 'Help';

export type Command = {
  id: string;
  title: string;
  section: CommandSection;
  shortcut?: string; // human-readable e.g. "⌘P"
  match?: string; // shortcut matcher key, e.g. "mod+p"
  when?: () => boolean;
  run: () => void | Promise<void>;
};

export type CommandRegistry = {
  list(): Command[];
  byMatch(combo: string): Command | undefined;
};
