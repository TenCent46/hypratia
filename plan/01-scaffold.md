# 01 — Scaffold Tauri + React + Vite

**Goal:** a runnable empty desktop app with the right deps installed.

**Depends on:** 00.

## Steps

1. Scaffold (this dir already contains `CLAUDE.md` and `plan/`, so scaffold to a temp dir and merge):
   ```bash
   cd ..
   npm create tauri-app@latest memory-canvas-tmp -- --template react-ts
   # Then move scaffold contents into ./memory-canvas/, preserving CLAUDE.md and plan/
   rsync -a --exclude='.git' memory-canvas-tmp/ memory-canvas/
   rm -rf memory-canvas-tmp
   ```
2. Install plugins:
   ```bash
   pnpm add @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-path
   pnpm add -D @types/node
   ```
3. Configure `src-tauri/capabilities/default.json`:
   - `fs:default` scoped to `$APPDATA/*` and `$APPDATA/**`.
   - `dialog:allow-open`, `dialog:allow-save`.
   - `path:default`.
4. App dependencies:
   ```bash
   pnpm add @xyflow/react zustand react-markdown remark-gfm gray-matter nanoid
   ```
5. Create empty service folders matching the source layout in CLAUDE.md.
6. Confirm `pnpm tauri dev` opens a window.

## Acceptance

- `pnpm tauri dev` launches a window showing the default Tauri/React scaffold.
- `pnpm tsc --noEmit` exits clean.
- `src-tauri/src/main.rs` is unchanged from the template.
- `src/services/`, `src/features/`, `src/store/`, `src/types/` exist (empty is fine).

## Risks

- `create-tauri-app` refusing a non-empty dir → use the temp-dir + rsync flow above.
- macOS Gatekeeper warning on first dev run — expected, click through.
- Tool choice drift between `pnpm` and `npm`. Pick one. **Pinning pnpm.**
