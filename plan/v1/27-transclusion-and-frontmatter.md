# 27 — Transclusion + frontmatter

**Goal:** node bodies can embed other nodes (`![[node-id]]`), can declare their own frontmatter editably, and the canvas understands block references.

**Depends on:** 17.

## Frontmatter, editable

The inspector gains a "Frontmatter" section above the title field. Free-form YAML editor (small Monaco-like control). Round-trips into the node's exported `.md`. Reserved keys (`id`, `conversationId`, `createdAt`, `updatedAt`, `linkedNodeIds`) are managed by the system and not user-editable; everything else is fair game.

## Transclusion

- `![[node-id]]` and `![[node-id|alias]]` embed the target node's content into the source node.
- Renders inline in the source's preview, with a small `↗` link to the target.
- If the target is large (>200 chars), show first 200 chars + "open" button.
- Cycle detection: `A` embeds `B` embeds `A` → render the second occurrence as a small pill `[[A]]` instead of recursing.

## Block references

- Blocks are paragraphs/headings. A block ref `[[node-id^block-id]]` targets a specific block (Obsidian-compatible).
- v1.0 scope: read-side only — typing the block-ref renders the targeted block. The UI for *creating* a block-id ("right-click on a paragraph → Copy block ref") ships if time allows; otherwise users hand-author.

## Implementation

- `remark-transclusion.ts` (from 17) — looks up node by id from the store, splices content as a node-tree node.
- New service `services/markdown/blockRefs.ts` — slices content by paragraph/heading; assigns deterministic block-ids based on slug + index.
- Inspector "Frontmatter" panel uses a tiny YAML editor; on blur, parses with `gray-matter` and persists the parsed object onto the node (free-form `tags`, `aliases`, `pdfRef`, etc.).

## Acceptance

- Author node A with body `![[B]]` → rendered preview shows B's content inline.
- Edit B → A's preview updates live.
- Cycle: A → B → A → render gracefully, no infinite loop.
- Adding a custom frontmatter field `priority: high` on a node → exports through to the .md frontmatter.
- Block ref `![[A^intro]]` renders just the first paragraph of A.

## Risks

- Large transclusion graphs (e.g., 100 nodes embed the same node) could re-render expensively — memoize the rendered tree of each transcluded node.
- Frontmatter editor is a foot-gun; YAML errors must show inline, not blank-out the node. Failed parse → keep last good value.
- Block-id stability: if user reorders paragraphs, deterministic ids change. Acknowledge this is an MVP-of-block-refs and document the limitation.
