/**
 * Hypratia sidecar schema (Obsidian-compatible vault export).
 *
 * One sidecar JSON per Hypratia entity, written next to (but not inside)
 * the user's Markdown / Canvas files. Sidecars carry every Hypratia-only
 * datum — the Markdown body and `.canvas` JSON stay clean and Obsidian-
 * native. Sidecars are keyed by `hypratia_id`, not by filename, so a user
 * renaming `.md` files in Obsidian never breaks the link.
 *
 * This file is **pure**: no fs, no Tauri, no DOM. All filesystem-coupled
 * work lives in `services/storage/SidecarFs.ts` and reuses these types.
 *
 *   Path:    `<vault>/Hypratia/.hypratia/sidecars/<sanitized_id>.json`
 *   Visible: `.hypratia/` is dot-prefixed so Obsidian hides it from the
 *            file pane by default — the vault stays readable.
 */

export const SIDECAR_SCHEMA_VERSION = 1 as const;
export const SIDECAR_DIR = 'Hypratia/.hypratia/sidecars';

export type SidecarEngine = 'local' | 'cheap-llm' | 'premium-llm';

/**
 * A derived view of an entity's content. Plan 51 stores Laconic /
 * Outline / Actions here. Original is *never* a SidecarView — original
 * lives in the Markdown body.
 */
export type SidecarView = {
  text: string;
  engine: SidecarEngine;
  /** Bumps per release; cache invalidates when this no longer matches. */
  prompt_version: string;
  generated_at: string;
};

export type SelectionMarkerData = {
  marker_id: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  question: string;
  answer_node_id: string;
  created_at: string;
};

export type LayoutHint = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HypratiaSidecar = {
  /** Magic key so `find . -name "*.json"` can identify Hypratia sidecars. */
  $schema: 'hypratia.sidecar';
  $version: typeof SIDECAR_SCHEMA_VERSION;
  /** Stable identity. The filename derives from this, not the other way. */
  hypratia_id: string;

  /** Provenance — which conversation / message produced this entity. */
  source_conversation_id?: string;
  source_message_id?: string;
  /** Hash of the Markdown body when last synced. Used to invalidate views. */
  original_text_hash?: string;

  /** Plan 51 — non-destructive derived views. */
  laconic_view?: SidecarView;
  outline_view?: SidecarView;
  action_items?: SidecarView;

  /** Heavy data with no place in YAML frontmatter. */
  theme_cluster?: string;
  selection_markers?: SelectionMarkerData[];
  /** Either an opaque path to an embedding blob, or a model+hash key. */
  embedding_ref?: string;
  layout_hint?: LayoutHint;

  last_distilled_at?: string;
  generated_at: string;
};

// ----- pure helpers ------------------------------------------------------

/**
 * Convert a `hypratia_id` into the vault-relative sidecar path. The id is
 * sanitized so any non-`[A-Za-z0-9_-]` byte becomes `_` — keeps the path
 * portable across filesystems and avoids accidental glob meta-characters.
 */
export function sanitizeSidecarId(hypratiaId: string): string {
  return hypratiaId.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Absolute path to a sidecar given the vault root. Pure string transform —
 * does not touch the filesystem.
 *
 * The id is the SOLE identity; this is why a user renaming the `.md` in
 * Obsidian never breaks the sidecar link.
 */
export function resolveSidecarPath(
  hypratiaId: string,
  vaultPath: string,
): string {
  return `${vaultPath}/${SIDECAR_DIR}/${sanitizeSidecarId(hypratiaId)}.json`;
}

/**
 * Merge a partial patch into an existing sidecar (or create one if absent).
 * Object-typed fields (selection_markers, *_view, layout_hint) replace
 * wholesale — partial updates of nested fields go through a higher-level
 * helper if needed. This keeps the merge predictable.
 */
export function mergeSidecarData(
  existing: HypratiaSidecar | null,
  hypratiaId: string,
  patch: Partial<Omit<HypratiaSidecar, '$schema' | '$version' | 'hypratia_id'>>,
): HypratiaSidecar {
  const base: HypratiaSidecar = existing ?? {
    $schema: 'hypratia.sidecar',
    $version: SIDECAR_SCHEMA_VERSION,
    hypratia_id: hypratiaId,
    generated_at: new Date().toISOString(),
  };
  // The id and version are immutable; everything else can be patched (or
  // explicitly cleared by passing `undefined` for that key).
  const merged: HypratiaSidecar = {
    ...base,
    $schema: 'hypratia.sidecar',
    $version: SIDECAR_SCHEMA_VERSION,
    hypratia_id: hypratiaId,
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      delete (merged as Record<string, unknown>)[k];
    } else {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}

/** Stable JSON serialization with stable key order. */
export function serializeSidecar(sidecar: HypratiaSidecar): string {
  return `${JSON.stringify(orderedSidecar(sidecar), null, 2)}\n`;
}

/**
 * Parse a sidecar text. Returns null when the file isn't actually a
 * Hypratia sidecar (wrong $schema, malformed JSON, version mismatch).
 * `hypratia_id` is filled in if missing — callers know it from the
 * filename and we want resilience against hand-edits.
 */
export function parseSidecar(
  text: string,
  hypratiaId: string,
): HypratiaSidecar | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.$schema !== 'hypratia.sidecar') return null;
  if (obj.$version !== SIDECAR_SCHEMA_VERSION) {
    // Future-proofing: drop unknown versions silently. Migrations can
    // upgrade in place when schema changes.
    return null;
  }
  if (typeof obj.hypratia_id !== 'string') {
    obj.hypratia_id = hypratiaId;
  }
  if (typeof obj.generated_at !== 'string') {
    obj.generated_at = new Date().toISOString();
  }
  return obj as HypratiaSidecar;
}

function orderedSidecar(s: HypratiaSidecar): Record<string, unknown> {
  // Force the meta keys to lead so the file is recognizable at a glance,
  // then keep everything else in insertion order.
  const meta = {
    $schema: s.$schema,
    $version: s.$version,
    hypratia_id: s.hypratia_id,
    generated_at: s.generated_at,
  };
  const rest: Record<string, unknown> = { ...s };
  for (const k of Object.keys(meta)) delete rest[k];
  return { ...meta, ...rest };
}
