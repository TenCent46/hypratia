# 53 — Obsidian companion plugin (deferred to v1.3+)

**Status:** **deferred.** Listed here so we don't lose the idea, and so Hypratia's data layout in plans 48 / 52 stays compatible with a future plugin. **Do not build this in v1.2.**

**Goal (when we do build it):** an Obsidian community plugin that makes Hypratia ↔ Obsidian feel native — push selected notes from Obsidian to Hypratia, refresh a Hypratia-generated canvas in place, and add an "Import from Hypratia" command palette entry.

## Why deferred

- File-based export (plans 48 + 52) already covers ~90% of what users actually need: Hypratia writes `.canvas` + `.md`; Obsidian opens them.
- A plugin only earns its keep once Hypratia has enough users that "shave one click" is worth the maintenance cost of a plugin in Obsidian's review pipeline.
- Obsidian's plugin API surface is broad and shifting; locking ourselves to it before the export design is stable invites churn.

We will revisit this **after** plans 48 + 52 ship and we have at least one user explicitly asking for it.

## When the time comes — feature surface

- **Command palette: "Hypratia: Refresh canvas from sidecar."** Re-reads `{canvasName}.hypratia.json` and re-applies node positions / labels without re-touching `.md` content.
- **Command palette: "Hypratia: Send selection to Hypratia."** Selected notes / blocks are pushed to a running Hypratia instance via a localhost handshake, becoming nodes on the user's current canvas.
- **Right-click on a Hypratia-owned note: "Open in Hypratia."** Resolves `hypratia_id` frontmatter and opens the source conversation in Hypratia.
- **Status bar item:** "Hypratia synced 2 min ago" with a click-to-open action.
- **Settings panel** mirroring Hypratia's vault-sync options for users who only ever see the Obsidian side.

## Communication channel

A localhost JSON-RPC over a fixed port (e.g., 49152) on the Hypratia side, off by default, opt-in toggle in Hypratia Settings → Vault → "Allow Obsidian companion plugin to connect." Authentication via a one-time pairing code; subsequent connections use a token persisted on both sides.

Do **not** require the plugin for any v1.2 feature to work — it is convenience, not a dependency.

## Constraints we should respect *now* (so v1.3 work is easy later)

These are the only v1.2-relevant items in this plan:

1. The `_index.json` (plan 52) is forward-compatible: the plugin reads it directly to know what Hypratia owns.
2. `hypratia_id` frontmatter is stable across renames so the plugin can resolve a note back to a Hypratia entity even if the user moved the file.
3. The optional `{canvasName}.hypratia.json` sidecar (plan 48) carries any geometry the plugin would need to re-flow without rewriting `.md` content.
4. Reserve frontmatter prefix `hypratia_` so the future plugin's reader has a single namespace.

## Acceptance (when built)

1. Plugin installs from BRAT or Community Plugins; pairs with a running Hypratia in under 30 seconds.
2. Selection-to-Hypratia round-trip: select 3 paragraphs in Obsidian → "Send to Hypratia" → 3 nodes appear on the active canvas.
3. Refresh-from-sidecar updates positions for every node listed in `.hypratia.json` without modifying any `.md` body.
4. Plugin keeps working with a stale Hypratia (no running instance) — commands surface a clear "Hypratia is not running" toast.

## Risks (when built)

- Obsidian Community Plugin review can take weeks; ship via BRAT first.
- Local RPC ports are firewalled in some environments; design fallback via filesystem mailbox (`Hypratia/.mailbox/`).
- API changes between Obsidian releases; pin `obsidian` types and add a CI check.
- Scope creep into "Obsidian-side editing of the canvas writes back to Hypratia." We do not want this in v1.3 either; that is full bidirectional sync and outside the wedge.
