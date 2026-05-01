import { useEffect, useMemo, useState } from 'react';
import {
  extractOutline,
  findBacklinks,
  type BacklinkEntry,
  type OutlineEntry,
} from './sidePanel';
import { aggregateTags } from './tagIndex';
import { SuggestLinks } from '../../canvas/SuggestLinks';
import type { ID } from '../../../types';

type Tab = 'outline' | 'backlinks' | 'tags' | 'suggestions';

const TABS: { id: Tab; label: string; icon: 'outline' | 'backlinks' | 'tags' | 'suggestions' }[] = [
  { id: 'outline', label: 'Outline', icon: 'outline' },
  { id: 'backlinks', label: 'Backlinks', icon: 'backlinks' },
  { id: 'tags', label: 'Tags', icon: 'tags' },
  { id: 'suggestions', label: 'Suggested', icon: 'suggestions' },
];

function SideIcon({ icon }: { icon: 'outline' | 'backlinks' | 'tags' | 'suggestions' }) {
  return <span className={`editor-side-icon ${icon}`} aria-hidden="true" />;
}

export function EditorSidePanel({
  doc,
  rootPath,
  currentPath,
  linkedNodeId,
  onJumpToLine,
  onOpenFile,
  visible,
  onToggle,
}: {
  doc: string;
  rootPath: string;
  currentPath: string;
  linkedNodeId?: ID | null;
  onJumpToLine: (line: number) => void;
  onOpenFile: (path: string, anchorLine?: number) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<Tab>('outline');
  const [backlinks, setBacklinks] = useState<BacklinkEntry[] | null>(null);
  const [backlinksLoading, setBacklinksLoading] = useState(false);
  const [tags, setTags] = useState<{ tag: string; count: number }[] | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);

  const outline: OutlineEntry[] = useMemo(() => extractOutline(doc), [doc]);

  useEffect(() => {
    if (!visible) return;
    if (tab !== 'backlinks') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setBacklinksLoading(true);
      void findBacklinks(rootPath, currentPath).then((entries) => {
        if (!cancelled) {
          setBacklinks(entries);
          setBacklinksLoading(false);
        }
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentPath, rootPath, tab, visible]);

  useEffect(() => {
    if (!visible) return;
    if (tab !== 'tags') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setTagsLoading(true);
      void aggregateTags(rootPath).then((entries) => {
        if (!cancelled) {
          setTags(entries);
          setTagsLoading(false);
        }
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rootPath, tab, visible]);

  if (!visible) {
    return (
      <aside
        className="editor-side-panel is-collapsed"
        aria-label="Collapsed editor outline and backlinks"
      >
        <div className="editor-side-rail" role="tablist" aria-orientation="vertical">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : undefined}
              onClick={() => {
                setTab(item.id);
                onToggle();
              }}
              title={item.label}
              aria-label={`Show ${item.label}`}
            >
              <SideIcon icon={item.icon} />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="editor-side-panel" aria-label="Editor outline and backlinks">
      <div className="editor-side-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : undefined}
            onClick={() => setTab(item.id)}
            role="tab"
            aria-selected={tab === item.id}
            title={item.label}
            aria-label={item.label}
          >
            <SideIcon icon={item.icon} />
          </button>
        ))}
        <button
          type="button"
          className="editor-side-collapse"
          onClick={onToggle}
          title="Hide side panel"
          aria-label="Hide side panel"
        >
          ×
        </button>
      </div>
      <div className="editor-side-body">
        {tab === 'outline' ? (
          outline.length === 0 ? (
            <div className="editor-side-empty">No headings yet.</div>
          ) : (
            <ul className="editor-outline-list">
              {outline.map((h) => (
                <li
                  key={h.id}
                  className={`level-${h.level}`}
                  style={{ paddingLeft: 6 + (h.level - 1) * 12 }}
                >
                  <button type="button" onClick={() => onJumpToLine(h.line)}>
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'backlinks' ? (
          backlinksLoading ? (
            <div className="editor-side-empty">Searching…</div>
          ) : !backlinks || backlinks.length === 0 ? (
            <div className="editor-side-empty">No backlinks.</div>
          ) : (
            <ul className="editor-backlinks-list">
              {backlinks.map((b, i) => (
                <li key={`${b.path}-${b.line}-${i}`}>
                  <button type="button" onClick={() => onOpenFile(b.path, b.line)}>
                    <span className="editor-backlinks-stem">{b.stem}</span>
                    <span className="editor-backlinks-snippet">{b.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'tags' ? (
          tagsLoading ? (
            <div className="editor-side-empty">Indexing…</div>
          ) : !tags || tags.length === 0 ? (
            <div className="editor-side-empty">No tags found.</div>
          ) : (
            <ul className="editor-tags-list">
              {tags.map((t) => (
                <li key={t.tag}>
                  <span className="editor-tag-chip">#{t.tag}</span>
                  <span className="editor-tag-count">{t.count}</span>
                </li>
              ))}
            </ul>
          )
        ) : linkedNodeId ? (
          <SuggestLinks nodeId={linkedNodeId} />
        ) : (
          <div className="editor-side-empty">
            Open this file as a canvas node to see related-node suggestions.
          </div>
        )}
      </div>
    </aside>
  );
}
