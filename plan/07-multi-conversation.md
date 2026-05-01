# 07 — Multiple conversations + global graph

**Goal:** many conversations, each with its own messages and map; edges may cross conversations; a global view shows everything.

**Depends on:** 06.

## UI

- Conversation switcher in the header: dropdown listing conversations.
  - "+ New conversation"
  - inline rename on double-click of the title
  - delete from a per-row menu (with confirm)
- View mode toggle in the header: **Current Map** / **Global Map**.
- Persist `lastConversationId` in settings; restore on boot.

## Data

- Nodes carry `conversationId` (already in schema).
- Edges have **no** conversation field — they reference any two node ids.
- Current Map: filter `nodes` by `conversationId` and edges to those whose endpoints are both visible.
- Global Map: pass all nodes/edges. Tint nodes by a stable hue derived from `conversationId` (subtle).

## Acceptance

- Create conversation A, drop nodes. Switch to B, drop nodes. Edge from A's node to B's node persists, visible in Global Map.
- Reload → starts in last active conversation, viewport restored.
- Renaming a conversation updates the switcher and the conversation file (after step 08).

## Risks

- Conversation count exploding → switcher becomes a wall. Cap visible at ~20 with a search-inside-dropdown later.
- Global view performance with many nodes — defer optimization until it actually slows.
- Hue assignment must be stable (hash of id), not random per render.
