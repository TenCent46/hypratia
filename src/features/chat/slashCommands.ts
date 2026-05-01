export type SlashCommand = {
  id: 'summarize' | 'newchat' | 'clear' | 'import-graph';
  trigger: string;
  label: string;
  description: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'summarize',
    trigger: '/summarize',
    label: 'Summarize',
    description: 'Summarize the current conversation into a canvas card',
  },
  {
    id: 'newchat',
    trigger: '/new',
    label: 'New chat',
    description: 'Start a fresh conversation',
  },
  {
    id: 'clear',
    trigger: '/clear',
    label: 'Clear input',
    description: 'Clear the current message input',
  },
  {
    id: 'import-graph',
    trigger: '/import-graph',
    label: 'Import to map',
    description: 'Paste a chat or text blob; build a graph of nodes + edges',
  },
];

export function matchSlashCommands(input: string): SlashCommand[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) return [];
  const q = trimmed.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.trigger.toLowerCase().startsWith(q));
}

export function parseSlashCommand(input: string):
  | { command: SlashCommand; args: string }
  | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const space = trimmed.indexOf(' ');
  const head = space === -1 ? trimmed : trimmed.slice(0, space);
  const args = space === -1 ? '' : trimmed.slice(space + 1).trim();
  const cmd = SLASH_COMMANDS.find((c) => c.trigger === head);
  if (!cmd) return null;
  return { command: cmd, args };
}
