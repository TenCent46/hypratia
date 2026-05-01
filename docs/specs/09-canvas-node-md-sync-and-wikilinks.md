# Canvas Node Markdown Sync And Wikilinks

## Goal

Canvas nodes are not just visual cards. A markdown node has a stable relationship to a local Markdown file, and canvas edges should be reflected as Obsidian-style links.

## Node Metadata

Each canvas node can store:

```ts
mdPath?: string
mdSectionId?: string
sourceMdId?: string
```

Phase behavior:

- `mdPath` is the canonical source.
- Multiple nodes may point to the same `mdPath`.
- Editing or resolving that Markdown path updates the canonical source instead of creating silent divergent copies.

## Creating Canonical Files

When a markdown node lacks `mdPath`, the app creates:

```txt
Canvas Nodes/<sanitized-title>.md
```

If the name exists, a numeric suffix is used.

## Wikilink Sync

When an edge connects node A to node B:

- Resolve or create canonical files for A and B.
- Append `[[B Title]]` to A's managed section.
- Append `[[A Title]]` to B's managed section as a backlink.
- Do not add duplicates.
- Do not insert links into user prose.

Managed section:

```md
## Canvas Links

- [[Target Note Title]]
```

## Deleting Edges

Edge deletion does not remove links yet. This avoids accidentally deleting user-managed links. Removal can be added later with ownership markers.

## Non-Goals

- No block-level sync.
- No destructive Markdown rewrites.
- No duplicate content propagation system.
