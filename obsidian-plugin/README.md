# Hypratia companion (Obsidian plugin)

Connects [Hypratia](https://hypratia.com) to Obsidian via the vault filesystem.
No localhost RPC, no socket — the plugin and Hypratia talk through plain files
under `Hypratia/` inside your vault, so it works whether or not Hypratia is
running.

Plan reference: [`../plan/v1.2/53-obsidian-companion-plugin.md`](../plan/v1.2/53-obsidian-companion-plugin.md).

## What it does

Three commands surface in Obsidian's command palette:

| Command | What it does |
| --- | --- |
| **Hypratia: Refresh canvas geometry from Hypratia sidecar** | Re-applies node positions stored in `Hypratia/Canvases/{name}.hypratia.json` to the active `.canvas` file. Use it to "rewind" a canvas to Hypratia's last-known layout after moving things around in Obsidian. Body / labels are not touched. |
| **Hypratia: Send selection to Hypratia** | Writes the active selection (or the whole file when nothing is selected) to `Hypratia/.mailbox/incoming/{nano}.json`. With Hypratia running and the mailbox watcher enabled (Settings → Capture), the payload opens in the Capture Preview. |
| **Hypratia: Send active file to Hypratia** | Same as above but for the entire active note. |
| **Hypratia: Open active note in Hypratia** | Launches `hypratia://open?id=…` for notes that carry a `hypratia_id` frontmatter key. Falls back to `?path=…` for plain notes. Requires Hypratia desktop to be installed and the URL scheme registered. |

A status bar item shows when Hypratia last synced the vault (read from
`Hypratia/_index.json`).

## Build

```bash
cd obsidian-plugin
npm install
npm run build       # writes main.js
```

For local development:

```bash
npm run dev         # esbuild --watch
```

## Install (development)

1. `npm run build`
2. Copy or symlink the plugin folder into
   `<your-vault>/.obsidian/plugins/hypratia-companion/`. The folder must
   contain `manifest.json`, `main.js`, and (optionally) `styles.css`.
3. In Obsidian: Settings → Community plugins → enable "Hypratia".

## Settings

- **Hypratia folder** — vault-relative subfolder Hypratia writes into.
  Default `Hypratia`. Match the value Hypratia uses (Hypratia → Vault).
- **Show status bar** — toggle the "Hypratia: synced 3m ago" indicator.

## Privacy

The plugin only reads / writes inside the configured Hypratia folder
(`Hypratia/` by default) plus its own `data.json` for settings. It never
makes network requests.

## Status

v0.1 — companion to Hypratia v1.2. Filesystem-mailbox transport only;
localhost RPC handshake is deferred to a later release.
