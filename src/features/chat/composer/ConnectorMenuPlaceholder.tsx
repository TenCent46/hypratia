import { ComposerActionMenuItem } from './ComposerActionMenuItem';
import { BlocksIcon } from './icons';

export type ComposerConnector = {
  id: string;
  label: string;
  description?: string;
};

export const CONNECTORS: ComposerConnector[] = [
  { id: 'gdrive', label: 'Google Drive', description: 'Coming soon' },
  { id: 'gmail', label: 'Gmail', description: 'Coming soon' },
  { id: 'slack', label: 'Slack', description: 'Coming soon' },
  { id: 'notion', label: 'Notion', description: 'Coming soon' },
  { id: 'github', label: 'GitHub', description: 'Coming soon' },
];

export function ConnectorSubmenu({
  onPick,
}: {
  onPick?: (c: ComposerConnector) => void;
}) {
  return (
    <div className="composer-submenu" role="menu" aria-label="Connectors">
      {CONNECTORS.map((c) => (
        <ComposerActionMenuItem
          key={c.id}
          icon={<BlocksIcon />}
          label={c.label}
          description={c.description}
          disabled
          onClick={() => onPick?.(c)}
        />
      ))}
    </div>
  );
}
