import { useEffect } from 'react';
import { isComboMatch, useCommands } from './useCommands';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

const ALWAYS_ALLOW = new Set([
  'mod+k',
  'mod+,',
  'mod+p',
  'mod+shift+/',
  'mod+enter',
]);

export function useKeymap(): void {
  const commands = useCommands();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const editable = isEditable(e.target);
      for (const c of commands) {
        if (!c.match) continue;
        if (!isComboMatch(e, c.match)) continue;
        if (editable && !ALWAYS_ALLOW.has(c.match)) continue;
        if (c.when && !c.when()) continue;
        e.preventDefault();
        e.stopPropagation();
        void c.run();
        return;
      }
    }
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [commands]);
}
