# 29 — Distribution

**Goal:** signed, notarized macOS .app distributable from a public download URL with auto-updates.

**Depends on:** 28.

## Apple Developer Program (calendar long-pole)

- CEO enrolls at developer.apple.com — $99/yr. 24–48 h to be approved. **Start as early as possible.**
- Generate "Developer ID Application" certificate.
- Generate App Store Connect API key for notarization.

Required env vars at build time:
- `APPLE_SIGNING_IDENTITY` — "Developer ID Application: <Name> (<TEAMID>)"
- `APPLE_ID` — your Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` — generated at appleid.apple.com
- `APPLE_TEAM_ID` — 10-char team id

Update `tauri.conf.json`:

```json
"bundle": {
  "macOS": {
    "minimumSystemVersion": "11.0",
    "entitlements": null,
    "exceptionDomain": "",
    "signingIdentity": "$APPLE_SIGNING_IDENTITY",
    "providerShortName": "$APPLE_TEAM_ID"
  }
}
```

Notarization runs as part of `pnpm tauri build` when env vars are present.

## Auto-update via Tauri updater + GitHub Releases

- Add `@tauri-apps/plugin-updater` (JS) + `tauri-plugin-updater` (Rust).
- Generate signing keypair: `pnpm tauri signer generate`. Public key goes in `tauri.conf.json`; private key is a GitHub Action secret.
- `latest.json` is published as a GitHub Release asset; the Rust updater fetches it.
- In-app: on launch, check for updates. If available, surface a small toast: "Memory Canvas 1.0.1 is available · Install on quit". Don't pop a modal mid-work.
- Settings → Updates → Channel: stable / beta. Beta channel reads from a separate `latest-beta.json`.

## CI (GitHub Actions)

`.github/workflows/release.yml`:

1. Trigger on tag push `v*.*.*`.
2. macOS-14 runner.
3. Install Rust toolchain, pnpm, project deps.
4. Inject Apple secrets.
5. `pnpm tauri build`.
6. Sign via Tauri's built-in macOS signing.
7. Upload `.app` (zipped), `.dmg`, and `latest.json` as Release assets.

Release artifact filenames:
- `Memory-Canvas-1.0.0-aarch64.dmg`
- `Memory-Canvas-1.0.0-aarch64.app.tar.gz`
- `latest.json`

## Privacy note shipped in-app

A short markdown page accessible from Help: "Memory Canvas does not phone home. The only network calls are: (1) you, talking to the AI provider whose key you configured, (2) update checks against github.com/<user>/memory-canvas/releases, which are anonymous."

## Telemetry

**Defer to v1.1.** v1.0 ships with zero telemetry. The Privacy section in Settings is a toggle reserved for the next release. Keeps the trust story simple; "no telemetry" is a feature for the local-first audience.

## Acceptance

- Tagging `v1.0.0` produces a public Release with .dmg, signed and notarized.
- Downloading the .dmg, dragging the app to /Applications, opening — Gatekeeper does NOT show the unsigned-developer warning.
- App finds the update from a subsequent `v1.0.1` release on launch and installs cleanly on quit.
- No content / event tracking traffic.

## Risks

- Apple notarization sometimes hangs in queue 5–30 minutes; the CI step needs `--wait` and a generous timeout.
- Universal binary (arm64 + x64) doubles build time; v1.0 ships **arm64-only**, x64 added in v1.0.1 if Intel Mac users complain.
- Updater pubkey rotation is painful; pick the keypair carefully and back up the private half.
- Tauri updater plugin requires CSP `connect-src` to include the GitHub release URL — adjust CSP in 24's update.
