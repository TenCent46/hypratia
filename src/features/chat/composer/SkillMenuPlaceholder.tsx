import { ComposerActionMenuItem } from './ComposerActionMenuItem';

// Architecture seam for future "Skills" — defined here so adding a skill is
// a one-liner: append to SKILLS, then handle it in onPick.
export type ComposerSkill = {
  id: string;
  label: string;
  description?: string;
  comingSoon?: boolean;
};

export const SKILLS: ComposerSkill[] = [
  { id: 'summarize', label: 'Summarize', description: 'Condense the chat so far' },
  { id: 'extract-tasks', label: 'Extract tasks', description: 'Pull TODOs from the conversation' },
  { id: 'rewrite', label: 'Rewrite', description: 'Tighten the latest reply' },
  { id: 'explain-code', label: 'Explain code', description: 'Walk through a snippet' },
  { id: 'create-canvas-card', label: 'Create canvas card', description: 'Drop a node onto the canvas' },
];

export function SkillSubmenu({ onPick }: { onPick?: (skill: ComposerSkill) => void }) {
  return (
    <div className="composer-submenu" role="menu" aria-label="Skills">
      {SKILLS.map((s) => (
        <ComposerActionMenuItem
          key={s.id}
          icon={<SparkleIcon />}
          label={s.label}
          description={s.description}
          disabled={s.comingSoon}
          onClick={() => onPick?.(s)}
        />
      ))}
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
      <path d="M19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.5z" />
    </svg>
  );
}
