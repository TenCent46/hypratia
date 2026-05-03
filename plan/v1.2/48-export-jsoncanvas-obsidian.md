# 48 — Export: JSON Canvas (Obsidian-compatible)

**Goal:** any Hypratia canvas can be exported to a `.canvas` file that opens in Obsidian Canvas with nodes and edges intact. This neutralizes the "Hypratia is just a worse Obsidian Canvas" framing — instead, Hypratia *feeds* Obsidian Canvas.

**Depends on:** existing export pipeline in `services/export/`.

## Format

The community spec at jsoncanvas.org defines a `.canvas` JSON shape used by Obsidian Canvas:

- Top-level: `{ "nodes": Node[], "edges": Edge[] }`.
- Node kinds: `text`, `file`, `link`, `group`. Each carries `id`, `x`, `y`, `width`, `height`, `color?`, plus kind-specific fields (`text`, `file`, `url`).
- Edges: `{ id, fromNode, fromSide?, toNode, toSide?, color?, label?, toEnd? }`.

We map our `CanvasNode`/`Edge` types to this shape:

| Hypratia | JSON Canvas |
| --- | --- |
| `MarkdownNode` (short body, ≤ ~280 chars) | `text` node with `text: contentMarkdown` |
| `MarkdownNode` (long body) | written to `Hypratia/notes/{id}.md` and referenced as a `file` node — this is the **default** for any node sourced from an assistant message |
| `ImageNode` (vault-attached) | `file` node referencing the image path |
| `PdfNode` | `file` node referencing the PDF path |
| `ArtifactNode` | written to `Hypratia/notes/{id}.md` and referenced as a `file` node |
| `ThemeNode` | `group` node with the cluster bounding box |
| `Edge` | JSON Canvas edge; `fromSide`/`toSide` derived from our handle ids; Hypratia's edge label maps to JSON Canvas `label` |

### Level 2 default — Markdown-first, Canvas-second

The Obsidian-native idiom is to keep long prose in Markdown files and treat the canvas as a *spatial index* of those files. Hypratia exports follow this idiom:

- Long bodies (anything beyond a tight Map-ready summary, see plan 51) go to `Hypratia/notes/{nodeId}.md`.
- The `.canvas` references those notes as `file` nodes — Obsidian renders them with full Markdown editing inside the canvas.
- Short Laconic / Map-ready bodies stay as `text` nodes for at-a-glance reading.
- Conversation root → a Markdown file under `Hypratia/conversations/{conversationId}.md`; the canvas anchors a `file` node to it at the center.

Recommended export tree inside the user's vault:

```
{vault}/
  Hypratia/
    conversations/
      2026-05-02-hypratia-positioning.md
    notes/
      n_decision_obsidian-positioning.md
      n_task_build-paste-to-canvas.md
      n_question_app-or-plugin.md
    canvases/
      hypratia-positioning.canvas
    attachments/
      …
```

This puts Obsidian in the role of the **library**; Hypratia is the **inflow**.

## Scope

1. **Export action** in the existing export menu: "Export as Obsidian Canvas (.canvas)".
2. **Vault-aware paths** — when the user's vault is configured, file references resolve to vault-relative paths so the export opens cleanly in Obsidian.
3. **Round-trip in v1.3** — read a `.canvas` and reconstruct nodes/edges. (v1.2: write only; v1.3: bidirectional.)
4. **Bundled assets** — when "Export with attachments" is selected, copy referenced images/PDFs into `LLM-Attachments/` next to the `.canvas` file.
5. **Test fixture** — a known canvas exports to a JSON Canvas blob that round-trips through Obsidian (manual verification documented in `plan/v1.2/manual-test-obsidian.md`).

## Implementation

New `src/services/export/JsonCanvasExport.ts`:

```ts
export function toJsonCanvas(canvas: CanvasSnapshot): JsonCanvas;
export async function writeJsonCanvas(path: string, canvas: CanvasSnapshot): Promise<void>;
```

- Pure transform first (`toJsonCanvas`) so it is unit-testable without Tauri.
- Side-side mapping: our handle ids `s-l/r/t/b` and `t-l/r/t/b` map to `fromSide` / `toSide` enum values.
- For `text` nodes, run our MarkdownRenderer's "to canonical markdown" pass to ensure the export contains plain Markdown (not HTML).

## Acceptance

1. Export a canvas with markdown nodes and edges → opens in Obsidian Canvas with nodes at correct positions, text rendered, edges connected.
2. Export with attachments → images and PDFs are present beside the `.canvas` file and resolve in Obsidian.
3. ThemeNodes export as `group` containers; child nodes appear inside the group bounds in Obsidian.
4. Edge arrows survive the round-trip (`toEnd: 'arrow'` set when our edge has an arrowhead, see plan 36).
5. Unit tests cover: empty canvas, single node, edge with custom side, group containing two nodes.

## Hypratia metadata — keep it OUT of the `.canvas`

JSON Canvas 1.0 is intentionally conservative; Obsidian itself notes the spec is a starting point and will not absorb every tool's extension fields. We do **not** stuff Hypratia-specific metadata (`messageId`, `sourceConversationId`, `view`, `provider`, `model`, `importanceScore`, `memoryCandidate`) into the canvas JSON. Instead:

- **Frontmatter on the Markdown sidecar** carries Hypratia metadata. Example:

  ```yaml
  ---
  hypratia_id: msg_abc123
  source: chatgpt
  view: laconic
  provider: anthropic
  model: claude-opus-4-7
  conversation: 2026-05-02-hypratia-positioning
  created: 2026-05-02
  tags:
    - hypratia
    - ai-conversation
  ---
  ```

- This survives Obsidian unchanged, is grep-friendly, and gives any third-party tool a path to find Hypratia content without parsing the canvas.
- A small JSON sidecar `{canvasName}.hypratia.json` (next to the `.canvas`) carries cross-canvas relationships that don't fit in frontmatter (e.g., per-edge importance scores). Optional; canvas opens fine without it.

## Risks

- JSON Canvas spec evolves. Pin to a version, document it in the export.
- Obsidian renders Markdown slightly differently — keep the exporter pure and let Obsidian own rendering.
- Vault path resolution can leak app-data paths if the user has not configured a vault — fall back to embedding image data URLs but warn the user.
- Frontmatter pollution: Obsidian indexes frontmatter; we add only the keys we own (prefixed `hypratia_` or under a `hypratia:` block) so we never collide with the user's existing schema.
