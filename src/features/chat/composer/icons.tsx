// Lucide-style stroked icons used by the composer "+" action menu.
// Inline SVGs (no extra dependency); shapes mirror lucide-react so a future
// swap to `lucide-react` is mechanical.

type Props = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function PaperclipIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function FolderPlusIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

export function BookOpenIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
    </svg>
  );
}

export function BlocksIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <path d="M10 21V8a1 1 0 00-1-1H4a1 1 0 00-1 1v13a1 1 0 001 1h5a1 1 0 001-1z" />
      <path d="M21 14h-7v7h7a1 1 0 001-1v-5a1 1 0 00-1-1z" />
    </svg>
  );
}

export function PlugIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 22v-5" />
      <path d="M9 7V2" />
      <path d="M15 7V2" />
      <path d="M6 13V8h12v5a4 4 0 01-4 4h-4a4 4 0 01-4-4z" />
    </svg>
  );
}

export function GlobeIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

export function RadarIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M19.07 4.93A10 10 0 0112 22a10 10 0 01-7.07-17.07" />
      <path d="M16.24 7.76A6 6 0 1112 6" />
      <path d="M12 12L19 5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export function FeatherIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z" />
      <path d="M16 8L2 22" />
      <path d="M17.5 15H9" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: Props) {
  return (
    <svg {...base} width={16} height={16} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: Props) {
  return (
    <svg {...base} width={16} height={16} className={className}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function CheckIcon({ className }: Props) {
  return (
    <svg {...base} width={16} height={16} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
