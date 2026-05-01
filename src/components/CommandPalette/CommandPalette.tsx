import { useEffect, useMemo } from 'react';
import { Command } from 'cmdk';
import { useStore } from '../../store';
import { useCommands } from '../../services/commands/useCommands';

export function CommandPalette() {
  const open = useStore((s) => s.ui.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const commands = useCommands();
  const visible = useMemo(
    () => commands.filter((c) => !c.when || c.when()),
    [commands],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const groups = visible.reduce<Record<string, typeof visible>>((acc, c) => {
    if (!acc[c.section]) acc[c.section] = [];
    acc[c.section].push(c);
    return acc;
  }, {});

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" loop>
          <Command.Input
            autoFocus
            placeholder="Type a command…"
            className="cmd-input"
          />
          <Command.List className="cmd-list">
            <Command.Empty className="search-empty">No commands.</Command.Empty>
            {Object.entries(groups).map(([section, cmds]) => (
              <Command.Group
                key={section}
                heading={section}
                className="cmd-group"
              >
                {cmds.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.section} ${c.title}`}
                    className="cmd-item"
                    onSelect={() => {
                      setOpen(false);
                      void c.run();
                    }}
                  >
                    <span>{c.title}</span>
                    {c.shortcut ? (
                      <kbd className="cmd-shortcut">{c.shortcut}</kbd>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
