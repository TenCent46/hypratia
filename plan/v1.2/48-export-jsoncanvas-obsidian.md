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
| `MarkdownNode` | `text` node with `text: contentMarkdown` |
| `ImageNode` (vault-attached) | `file` node referencing the image path |
| `PdfNode` | `file` node referencing the PDF path |
| `ArtifactNode` | `text` node with the artifact rendered as markdown |
| `ThemeNode` | `group` node with the cluster bounding box |
| `Edge` | JSON Canvas edge; `fromSide`/`toSide` derived from our handle ids |

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

## Risks

- JSON Canvas spec evolves. Pin to a version, document it in the export.
- Obsidian renders Markdown slightly differently — keep the exporter pure and let Obsidian own rendering.
- Vault path resolution can leak app-data paths if the user has not configured a vault — fall back to embedding image data URLs but warn the user.
