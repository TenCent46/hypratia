# 32 — Workspace identity and project rename

**Goal:** the user can rename the visible project/workspace name without rebuilding the app.

**Depends on:** settings persistence.

## Scope

- Add `settings.workspaceName`.
- Header title reads from workspace settings and falls back to "Memory Canvas".
- Settings → General gains an editable workspace/project name field.
- Export frontmatter and map metadata can include workspace name where useful.
- App bundle product name remains "Memory Canvas"; this is user workspace identity, not bundle branding.

## Implementation

1. Extend `Settings` with `workspaceName?: string`.
2. Add `setWorkspaceName(name)` to the store.
3. Update the header title to show the workspace name.
4. Add a General/Workspace field in Settings.
5. Trim empty names back to the default.

## Acceptance

- Rename to "Thesis Research" and the header updates immediately.
- Quit/relaunch preserves the name.
- Clearing the field returns to "Memory Canvas".
- Conversation titles remain independent.

## Risks

- "Project name" can mean app brand, workspace, or current conversation. UI copy should say "Workspace name" to avoid ambiguity.
