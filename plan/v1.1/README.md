# Memory Canvas v1.1 — improved user experience version

v1.0 made the product real. v1.1 makes it feel modern, direct, and AI-native: fewer buttons, better drag/drop, editable project identity, a polished Markdown writing surface, and an AI experience that feels comparable to dedicated chat products.

## Product thesis

Memory Canvas should feel like a native thinking app with AI inside it, not a developer demo around a graph. The primary motion is: talk, drag useful ideas onto the canvas, edit them comfortably, and ask AI to deepen or research them without leaving context.

## Phases & order

- [x] [31 — Direct manipulation chat-to-canvas](31-direct-manipulation.md)
- [x] [32 — Workspace identity and project rename](32-workspace-identity.md)
- [x] [33 — NOTE-like Markdown editor](33-note-like-editor.md)
- [x] [34 — AI experience refinement](34-ai-experience.md)
- [x] [35 — Modern visual design pass](35-modern-design-pass.md)

## Acceptance for v1.1

1. Dragging any completed user/assistant message onto the canvas creates a node exactly where it is dropped.
2. The chat panel does not need an "Add to canvas" button for normal use.
3. Copy/delete actions are compact icon controls with accessible labels.
4. The user can rename the workspace/project name from Settings and the header reflects it.
5. Editing a node feels like a simple writing app: clean formatting controls, live preview option, Markdown shortcuts, and no YAML-looking clutter during normal writing.
6. AI responses stream with clear activity states, stop/regenerate affordances, model/provider visibility, and helpful error recovery.
7. Web search and deep research are designed behind explicit user controls, with source citations and privacy boundaries.
8. The app reads as a contemporary desktop product: quieter chrome, stronger hierarchy, purposeful motion, and no explanatory feature text in the main workspace.

## Non-goals

- Replacing the local-first model with a cloud backend.
- Shipping telemetry by default.
- Building a full Notion clone. The editor should be excellent for Markdown notes, not a database/page-builder.
- Unrestricted web browsing by default. Search/research must be explicit and cite sources.

## Status

Started after v1.0-beta.1 on 2026-04-26.
