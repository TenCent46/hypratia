import { useMemo, useState } from 'react';
import matter from 'gray-matter';

/**
 * Frontmatter properties editor.
 *
 * - When a document has a leading YAML frontmatter block, we show a
 *   compact "Properties" header. Expanded, each scalar key becomes a
 *   typed input, and array values render as comma-separated text.
 * - Unknown / nested types fall back to read-only display so we never
 *   round-trip them lossily.
 * - On change we re-stringify with `gray-matter` and emit the full
 *   document so the parent's existing save path applies.
 */

type FieldType = 'string' | 'number' | 'boolean' | 'list' | 'unknown';

type Field = {
  key: string;
  type: FieldType;
  raw: unknown;
};

function detectType(value: unknown): FieldType {
  if (value === null) return 'unknown';
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'string' || typeof v === 'number') ? 'list' : 'unknown';
  }
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

function buildFields(data: Record<string, unknown>): Field[] {
  return Object.keys(data).map((key) => ({
    key,
    type: detectType(data[key]),
    raw: data[key],
  }));
}

function listToString(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((v) => String(v)).join(', ');
}

export function PropertiesEditor({
  doc,
  onChange,
}: {
  doc: string;
  onChange: (next: string) => void;
}) {
  const parsed = useMemo(() => {
    try {
      return matter(doc);
    } catch {
      return null;
    }
  }, [doc]);

  const [expanded, setExpanded] = useState(false);

  // No frontmatter — render nothing. (Phase 1 doesn't auto-add a block.)
  if (!parsed || !parsed.matter || parsed.matter.trim() === '') return null;

  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const fields = buildFields(data);

  const update = (key: string, type: FieldType, nextRaw: unknown) => {
    const nextData: Record<string, unknown> = { ...data };
    if (type === 'list' && typeof nextRaw === 'string') {
      nextData[key] = nextRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      nextData[key] = nextRaw;
    }
    const nextDoc = matter.stringify(parsed.content, nextData);
    onChange(nextDoc);
  };

  return (
    <div className={`editor-properties${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="editor-properties-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="editor-properties-caret">{expanded ? 'v' : '>'}</span>
        <span>Properties</span>
        <span className="editor-properties-count">{fields.length}</span>
      </button>
      {expanded ? (
        <div className="editor-properties-body">
          {fields.map((f) => (
            <div className="editor-properties-row" key={f.key}>
              <span className="editor-properties-key">{f.key}</span>
              {f.type === 'string' ? (
                <input
                  type="text"
                  value={String(f.raw ?? '')}
                  onChange={(e) => update(f.key, 'string', e.target.value)}
                />
              ) : f.type === 'number' ? (
                <input
                  type="number"
                  value={Number(f.raw ?? 0)}
                  onChange={(e) => update(f.key, 'number', Number(e.target.value))}
                />
              ) : f.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={Boolean(f.raw)}
                  onChange={(e) => update(f.key, 'boolean', e.target.checked)}
                />
              ) : f.type === 'list' ? (
                <input
                  type="text"
                  value={listToString(f.raw)}
                  onChange={(e) => update(f.key, 'list', e.target.value)}
                  placeholder="comma, separated, values"
                />
              ) : (
                <code className="editor-properties-readonly">
                  {JSON.stringify(f.raw)}
                </code>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
