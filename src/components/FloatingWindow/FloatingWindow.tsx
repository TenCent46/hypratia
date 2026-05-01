import type { ReactNode } from 'react';

export function FloatingWindow({
  title,
  className = '',
  onClose,
  children,
}: {
  title: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`floating-window ${className}`} aria-label={title}>
      <header className="floating-window-header">
        <span>{title}</span>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
          ×
        </button>
      </header>
      <div className="floating-window-body">{children}</div>
    </section>
  );
}
