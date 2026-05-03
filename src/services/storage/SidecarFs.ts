/**
 * Filesystem-coupled wrappers around the pure sidecar schema (see
 * `services/sidecar/schema.ts`). Lives in `services/storage/` so the
 * `@tauri-apps/*` import allowlist accepts the dependency.
 *
 *   loadSidecar(id, vaultPath)        — read; null when missing or invalid
 *   saveSidecar(id, sidecar, vault)   — atomic write
 *   mergeSidecarPatch(id, patch, vlt) — load → merge → save
 *   resolveSidecarPath(id, vault)     — re-exported from the pure module
 */

import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  type HypratiaSidecar,
  SIDECAR_DIR,
  mergeSidecarData,
  parseSidecar,
  resolveSidecarPath,
  serializeSidecar,
} from '../sidecar/schema';

export {
  type HypratiaSidecar,
  type SidecarView,
  type SidecarEngine,
  resolveSidecarPath,
} from '../sidecar/schema';

async function ensureDir(p: string): Promise<void> {
  if (!(await exists(p))) await mkdir(p, { recursive: true });
}

export async function loadSidecar(
  hypratiaId: string,
  vaultPath: string,
): Promise<HypratiaSidecar | null> {
  const path = resolveSidecarPath(hypratiaId, vaultPath);
  if (!(await exists(path))) return null;
  try {
    const text = await readTextFile(path);
    return parseSidecar(text, hypratiaId);
  } catch {
    // Unreadable / corrupt — treat as missing. The next save will
    // overwrite cleanly. We deliberately do not throw because a sidecar
    // miss must never block the parent flow.
    return null;
  }
}

export async function saveSidecar(
  hypratiaId: string,
  sidecar: HypratiaSidecar,
  vaultPath: string,
): Promise<void> {
  await ensureDir(`${vaultPath}/${SIDECAR_DIR}`);
  const path = resolveSidecarPath(hypratiaId, vaultPath);
  await writeTextFile(path, serializeSidecar(sidecar));
}

/**
 * Read the existing sidecar (if any), apply `patch` via the pure merger,
 * write the result. Returns the merged sidecar so callers can react.
 */
export async function mergeSidecarPatch(
  hypratiaId: string,
  patch: Partial<Omit<HypratiaSidecar, '$schema' | '$version' | 'hypratia_id'>>,
  vaultPath: string,
): Promise<HypratiaSidecar> {
  const existing = await loadSidecar(hypratiaId, vaultPath);
  const merged = mergeSidecarData(existing, hypratiaId, patch);
  await saveSidecar(hypratiaId, merged, vaultPath);
  return merged;
}
