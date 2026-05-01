# 28 — Onboarding + polish

**Goal:** the first 60 seconds after launch feel deliberate. App icon is real. Every empty state, hover, animation, and edge case is intentional.

**Depends on:** all preceding v1 steps.

## Onboarding flow (first launch)

3-step gentle modal:

1. **Welcome** — one paragraph explaining the spatial-canvas-+-AI-chat metaphor. Keyboard shortcut chart preview. "Skip" available at every step.
2. **Add a provider** — minimal Settings tab → "Pick one to start" cards (OpenAI / Anthropic / Groq / "Run locally with Ollama"). Each card → paste-key → Test → ✅. Skipping is allowed; the app works as a journal until a key is added.
3. **Pick your vault (optional)** — folder picker. Skip → app data only.

Then drop the user into a pre-seeded conversation: a system message explaining "This is your first conversation. Try ⌘J on selected text." Two example nodes already on the canvas with an edge between them.

## App icon

- 1024×1024 PNG, transparent background.
- Visual: simple white card on a soft gradient background, with a single graph-edge connecting two dot-nodes; serif "M" mark in the corner.
- Generate via designer / AI gen + manual cleanup. **CEO action item.**
- Once placed at `src-tauri/icons/icon.png`, run `pnpm tauri icon`. All sizes auto-generated.

## Empty states (curated)

| Surface | Empty state |
|---|---|
| Empty canvas, has chat | "Drag a thought here, or press ⌘E for a blank node." |
| Empty canvas, empty chat | "Start with a question, or press ⌘D for today's daily note." |
| Empty chat | "Ask anything. Drag the answer onto the canvas." |
| Empty conversation list | "Press ⌘N for a new conversation." |
| No search results | "No matching memory found." |
| No suggestions in Suggest Links | "Not enough nodes yet — keep thinking." |
| No PDF text layer | "This PDF is scanned. OCR coming in v1.1." |
| No provider configured | "Add an AI provider in Settings to enable chat." |

## Micro-animations

- Node creation: scale-in 120 ms.
- Edge connect: fade-in 100 ms.
- Tab switch: 80 ms.
- Modal open: 120 ms ease-out, no scale.
- All animations respect `prefers-reduced-motion`.

## Typography pass

- Audit every font-size / line-height / weight against tokens.
- Serif for node titles (already), confirmed legibility at every theme.
- Code blocks inherit Shiki theme (already light/dark aware).

## Acceptance

- A new user, given the .app and no instruction, can create + connect their first two nodes within 90 seconds.
- App icon appears in Dock, ⌘-Tab, Mission Control.
- Reduced-motion preference disables animations.
- No raw "undefined" / "null" / "[object Object]" anywhere in the UI under any error path.

## Risks

- Onboarding scope creep — if it takes more than a day to build, cut step 3 (vault picker can come up via Settings).
- Animation perf in Tauri's webview is good but not flawless on Intel Macs — keep durations short and budget-friendly.
- App icon design is the long-pole external dependency.
