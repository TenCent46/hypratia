import { ComposerActionMenuItem } from './ComposerActionMenuItem';
import { FeatherIcon } from './icons';

export type ComposerStyle = {
  id: string;
  label: string;
  description?: string;
};

export const STYLES: ComposerStyle[] = [
  { id: 'default', label: 'Default', description: 'No style override' },
  { id: 'formal', label: 'Formal', description: 'Polished, business-ready prose' },
  { id: 'casual', label: 'Casual', description: 'Conversational and warm' },
  { id: 'investor-memo', label: 'Investor memo', description: 'Tight, executive summary' },
  { id: 'academic', label: 'Academic', description: 'Citations and rigor' },
  { id: 'japanese-reflective', label: 'Japanese reflective prose', description: '日本語・随筆調' },
];

export function StyleSubmenu({
  activeStyleId,
  onPick,
}: {
  activeStyleId?: string;
  onPick?: (style: ComposerStyle) => void;
}) {
  return (
    <div className="composer-submenu" role="menu" aria-label="Use style">
      {STYLES.map((s) => (
        <ComposerActionMenuItem
          key={s.id}
          icon={<FeatherIcon />}
          label={s.label}
          description={s.description}
          active={activeStyleId === s.id}
          onClick={() => onPick?.(s)}
        />
      ))}
    </div>
  );
}
