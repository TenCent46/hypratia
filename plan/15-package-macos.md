# 15 — macOS packaging

**Goal:** a runnable `.app` you can open from Finder.

**Depends on:** 14.

## Steps

1. Set `src-tauri/tauri.conf.json`:
   - `productName: "Memory Canvas"`.
   - `identifier: "com.<your-handle>.memory-canvas"`.
   - `version: "0.1.0"`.
   - `mainBinaryName: "Memory Canvas"`.
2. Add app icon: place a 1024×1024 PNG (with alpha) at `src-tauri/icons/icon.png`. Generate the full set:
   ```bash
   pnpm tauri icon src-tauri/icons/icon.png
   ```
3. Build:
   ```bash
   pnpm tauri build
   ```
4. Output lands in `src-tauri/target/release/bundle/macos/`:
   - `Memory Canvas.app`
   - `Memory Canvas_0.1.0_aarch64.dmg`
5. Double-click the `.app` → app runs.

## Run modes

- **Dev:** `pnpm tauri dev`
- **Local prod build:** `pnpm tauri build` → run from `target/release/bundle/macos/Memory Canvas.app`

## Deferred (Tier 2)

- Code signing with Apple Developer ID.
- Notarization (`xcrun notarytool`).
- Auto-updates (Tauri updater plugin).
- Universal binary (arm64 + x64).
- App Store distribution.

## Risks

- Unsigned `.app` triggers Gatekeeper on first launch. Workaround: right-click → Open. Document this in the app README.
- `tauri icon` is picky about exact size and alpha channel — keep source as 1024×1024 PNG with transparency.
- Bundle id collisions if you copy this from another project — change `identifier` first.
