# 33 — NOTE-like Markdown editor

**Goal:** node editing should feel like a polished Japanese NOTE-style writing surface: calm, readable, minimal chrome, Markdown underneath.

**Depends on:** node inspector, Markdown renderer.

## Scope

- Replace the plain textarea-first inspector with a richer editor surface.
- Keep Markdown as the persisted source of truth.
- Provide common formatting controls: heading, bold, italic, quote, code, link, list, checklist.
- Support split modes: Edit, Preview, Side-by-side.
- Hide frontmatter from normal writing; advanced metadata lives in a collapsible panel.
- Add keyboard shortcuts for formatting.

## Candidate stack

- Preferred: CodeMirror 6 with Markdown extensions and toolbar wrappers.
- Alternative: Milkdown or TipTap with Markdown serialization.
- Avoid: bespoke contenteditable without a proven parser.

## Implementation

1. Create `features/editor/MarkdownEditor.tsx`.
2. Wrap CodeMirror editor state around node content.
3. Add formatting command helpers that transform selected text.
4. Integrate into `NodeInspector`.
5. Keep autosave-on-blur initially; move to debounced autosave only after confidence.
6. Move frontmatter into an "Advanced metadata" disclosure.

## Acceptance

- Editing long Markdown is comfortable and does not resize unpredictably.
- Toolbar commands work on selected text.
- Preview matches canvas rendering.
- Existing node Markdown round-trips without data loss.
- YAML errors in metadata never destroy note content.

## Risks

- Rich editors can fight Markdown. Markdown remains canonical.
- Bundle size can grow. CodeMirror chunks should be lazy-loaded if needed.
