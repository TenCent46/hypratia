import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { useCommands } from '../../services/commands/useCommands';

export function ShortcutsModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.ui.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  const commands = useCommands();
  if (!open) return null;
  const withShortcut = commands.filter((c) => c.shortcut);
  const groups = withShortcut.reduce<Record<string, typeof withShortcut>>(
    (acc, c) => {
      if (!acc[c.section]) acc[c.section] = [];
      acc[c.section].push(c);
      return acc;
    },
    {},
  );
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('shortcuts.title')}</h2>
          <button type="button" className="close" onClick={() => setOpen(false)}>
            ×
          </button>
        </header>
        <div className="shortcut-grid">
          {Object.entries(groups).map(([section, cmds]) => (
            <section key={section}>
              <h3>{section}</h3>
              <ul>
                {cmds.map((c) => (
                  <li key={c.id}>
                    <span>{c.title}</span>
                    <kbd>{c.shortcut}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
