# Memory Canvas v1.0 — ready-to-ship plan

The MVP proved the metaphor: chat on the right, drag thoughts onto the canvas on the left, everything is yours, exports cleanly to Obsidian. v1.0 turns that into a product people will pay for.

This document is the master plan. Each numbered file is the contract for one workstream: read it before starting, edit it if scope changes, tick it in the index when done.

## Vision (one paragraph)

A local-first **AI thinking workspace**. You bring your own API keys. The right pane is a real streaming chat — multi-provider, multi-model, switch on the fly. The left pane is your spatial memory: drag chat fragments onto an infinite canvas, drop PDFs and images, and **highlights inside PDFs spawn linked Markdown cards** — that last move is the moat. Everything saves locally as Markdown into an Obsidian-compatible vault, so even if you stop paying us tomorrow, your thinking comes with you.

## What changes from MVP → v1.0

| Surface | MVP | v1.0 |
|---|---|---|
| Chat | local journaling, no LLM | real streaming multi-provider chat (OpenAI / Anthropic / Groq / Mistral / Ollama / OpenRouter) |
| Summarizer | mock | real, behind same `Summarizer` interface |
| Markdown | `react-markdown` + GFM | + KaTeX (math), Shiki (syntax), Mermaid (diagrams), Obsidian-style callouts, footnotes, wikilinks, transclusion |
| Theme | one calm light | light + dark + sepia + high-contrast, full Tailwind v4 token system, swap by `[data-theme]` |
| Attachments | none | images + PDFs as files in `<appData>/attachments/`, drag-drop and paste-from-clipboard |
| PDF | none | viewer-as-canvas-node, **highlight inside PDF spawns linked card** |
| Settings | data-folder + vault | + API keys (OS keychain), default model, theme, daily notes folder |
| Capture | type into chat | + ⌘⇧Space global quick-capture, daily notes, templates |
| Linking | manual edges | + transclusion (`![[node-id]]`), frontmatter, block refs |
| Distribution | unsigned `.app` | code-signed + notarized, `.dmg` + auto-update |
| Discovery | none | command palette (⌘P) for everything, organized hotkeys, onboarding flow |
| AI UX | "summary" button | Reflect-style **AI palette** on selection (⌘J) — preset prompts + free-form |

## Phases & order

Build in phases, not parallel. Each phase ends in something demoable.

### Phase A — Foundation (~10 days)

These are the visible-but-enabling changes. They underpin everything else.

- [x] [16 — Theme system](16-theme-system.md) — done via plain CSS-var tokens (Tailwind v4 deferred). Light/dark/sepia/high-contrast all pass `[data-theme]`.
- [x] [17 — Markdown stack v2](17-markdown-stack.md) — KaTeX + highlight.js (Shiki deferred), callouts, wikilinks `[[id]]`, transclusion `![[id]]`. Mermaid deferred to v1.0.1.
- [x] [18 — Attachments architecture](18-attachments-architecture.md) — `services/attachments/` with `TauriAttachmentService`, `convertFileSrc`, asset-protocol scope, vault export of `LLM-Attachments/`.
- [x] [19 — Command palette + shortcuts](19-command-palette-and-shortcuts.md) — `cmdk` palette, command registry, `useKeymap`, shortcuts cheat sheet (⌘?).

### Phase B — The product becomes a real AI tool (~10 days)

- [x] [20 — Secrets and settings](20-secrets-and-settings.md) — settings tab + plaintext `LocalSecretsService` (v1.0-beta path). Keychain swap deferred per plan.
- [x] [21 — Multi-provider LLM layer](21-llm-providers.md) — OpenAI, Anthropic, Google (`@ai-sdk/google`), Mistral (`@ai-sdk/mistral`), Groq + OpenRouter via `@ai-sdk/openai-compatible`, Ollama. `costEstimator.ts` powers the cost meter.
- [x] [22 — Real streaming chat](22-real-chat.md) — streaming + abort + per-conversation model + token usage rollup + cost meter in `ChatHeader`.
- [x] [23 — AI palette on selection](23-ai-palette.md) — ⌘J palette with presets (improve, summarize, expand, extract, question) + custom prompt → make-a-node.

### Phase C — Attachments turn it into a research tool (~12 days)

This is where v1.0 separates from "Obsidian + plugins."

- [x] [24 — Images + basic PDF viewer](24-pdf-viewer.md) — `react-pdf` viewer modal, image + PDF canvas node types, drag-drop ingest via attachment service. Page virtualization deferred (linear render works for typical PDFs; heavy ones can revisit react-window).
- [x] [25 — PDF highlight-to-card](25-pdf-highlight-to-card.md) — text-layer selection → action bar → Card / Card + Ask AI / Quote, with `pdfRef` frontmatter and a labeled back-edge to the PDF node. **The differentiator.**

### Phase D — Daily-driver feel (~6 days)

- [x] [26 — Daily notes, templates, quick capture](26-daily-workflow.md) — ⌘D daily note (auto-creates `YYYY-MM-DD` conversation kind:`daily`), `applyTemplate`, ⌘⇧Space in-app quick capture into Inbox. OS-level global shortcut deferred (needs `tauri-plugin-global-shortcut`; in-app shortcut works whenever the app is focused).
- [x] [27 — Transclusion + frontmatter](27-transclusion-and-frontmatter.md) — `![[id]]` transclusion with cycle detection + depth cap, editable free-form `frontmatter` per node merged into export. Block refs (`^block-id`) deferred to v1.0.1 (needs deterministic block-id slicing).

### Phase E — Ship (~7 days, includes calendar wait time for Apple)

- [x] [28 — Onboarding + polish](28-onboarding-polish.md) — 3-step Onboarding modal on first launch, curated empty-state copy, `prefers-reduced-motion` honored. **App icon is a CEO action item** (1024×1024 PNG → `pnpm tauri icon`).
- [x] [29 — Distribution](29-distribution.md) — `tauri.conf.json` macOS bundle + updater plugin scaffold (`active: false` until pubkey is generated), `.github/workflows/release.yml` ready. **CEO action items:** Apple Developer enrollment + secrets (`APPLE_*`, `TAURI_SIGNING_PRIVATE_KEY`).
- [x] [30 — Launch checklist](30-launch-checklist.md) — `README.md` + `CHANGELOG.md` shipped; `pnpm tsc --noEmit` and `pnpm lint` clean. **Manual flow audit and Apple notarization smoke remain CEO-side** once signing certs land.

**Total estimate: ~6 weeks of focused dev for full v1.0.** Compressible to ~4 weeks if Phase D is deferred to v1.1 and we ship a "v1.0-beta" first.

## Tier definition

- **v1.0 must-have** — Phases A, B, C, plus 28-onboarding and 29-distribution from Phase E.
- **v1.0 nice-to-have** — Phase D in full.
- **v1.1** — sync (CRDT-based), local embeddings (ONNX/transformers.js), web port, mobile read-only companion, plugin API.

## Stack additions (delta from MVP)

| Concern | Adding | Replacing |
|---|---|---|
| LLM client | `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible`, `zod` | `MockSummarizer` only |
| Secret storage | `tauri-plugin-keyring` (Rust + JS) | — |
| Markdown | either `streamdown` **or** `katex` + `rehype-katex` + `remark-math` + `shiki` + `rehype-shiki` + `mermaid` + custom remark-callouts | extends `react-markdown` |
| PDF | `react-pdf` (pulls `pdfjs-dist`) + `react-window` for page virtualization | — |
| Themes | `tailwindcss@4` + `@tailwindcss/vite` | hand-rolled CSS vars (compatible — Tailwind v4 is layered on top) |
| Command palette | `cmdk` | — |
| Updater | `@tauri-apps/plugin-updater` | — |
| Telemetry (opt-in) | self-hosted **Plausible** or **PostHog** OR none for v1.0 — decision below | — |

Bundle delta estimate: roughly **+8 MB** unzipped on the JS side (PDF.js is the largest single contributor at ~1 MB gzipped, lazy-loaded). The .app should still come in under **30 MB** total — an order of magnitude smaller than any Electron equivalent.

## Architectural rules (v1.0 update — same spirit, expanded)

The platform-leak rule from MVP gets one new exception:

> Only `services/storage/`, `services/export/`, `services/dialog/`, **`services/secrets/`**, and **`services/llm/`** may import from `@tauri-apps/*`.

Two new services added:

- `services/secrets/` — wraps `tauri-plugin-keyring` for API key get/set/clear.
- `services/llm/` — wraps Vercel AI SDK; the rest of the app talks to it via `ChatProvider`, `Summarizer`, `EmbeddingProvider`. Provider implementation details (key fetching, base URL routing, streaming wire format) stay inside this service.

CLAUDE.md will be updated alongside step 20 to reflect the new boundaries.

## Success criteria for v1.0 ship

You can give the .app to a non-engineer friend and they can, without help:

1. Launch it (no Gatekeeper warning — it's signed and notarized).
2. Open Settings, paste an OpenAI key, click "Test" → see ✅ in <2 s.
3. Type a chat message, get a streaming response back.
4. Drag the response onto the canvas → it becomes a node.
5. Paste an image from clipboard → it appears in chat or on canvas.
6. Drag a PDF in → it renders as a card. Highlight a paragraph → a new linked card appears with that paragraph.
7. ⌘P opens the command palette; everything they need is one fuzzy-search away.
8. ⌘J on selected text → "Summarize this" → a node lands on the canvas.
9. Click "Export to Markdown" → vault opens in Obsidian → graph view shows all the links.
10. Quit, relaunch → everything is exactly where it was.

If any one of those breaks, v1.0 isn't shipping yet.

## Decisions I need from you (CEO)

These are unblockers, not preferences. Most are 1–2 sentences to answer.

| # | Decision | Why I need it | My recommendation |
|---|---|---|---|
| 1 | **Brand name** — keep "Memory Canvas" or rename? | Affects icon, bundle id, marketing copy, domain. | Keep. It's accurate and memorable. |
| 2 | **App icon** — designer, AI-gen, or stock? | Needed for Phase E. Real product needs a real icon. | Get a designer ($200–500 on 99designs/Dribbble) or use Midjourney + manual cleanup. Avoid emoji-as-icon. |
| 3 | **Pricing model** | Drives whether we wire purchase / license-key / nothing. | **One-time license, $59**, or **$5/mo**, BYOK keeps both viable since we have no AI cost. Lifetime feels right for the "your thinking, your machine" positioning. |
| 4 | **Apple Developer Program enrollment** ($99/yr) | Required for clean distribution. 24–48 h to be approved. | Yes. Start now — it's the long-pole calendar item. |
| 5 | **Day-1 LLM providers** | Affects Phase B scope. | OpenAI + Anthropic + Groq + Ollama (local). Skip OpenRouter for v1.0 (their endpoint is OpenAI-compatible so it's still 30 min to add post-launch). |
| 6 | **Telemetry** — none / Plausible (web only) / PostHog | Helps product decisions, but at a privacy cost. | **Opt-in PostHog**, default-off, never track content. Lets us see crashes and feature usage. |
| 7 | **Auto-update host** | GitHub Releases (free) vs S3/Cloudflare R2. | GitHub Releases. Free, the Tauri updater speaks its format natively, the public release page doubles as a changelog. |
| 8 | **Beta tester pool** | Want 5–15 humans testing Phase B onward. | Recruit early, before Phase C — feedback on chat UX is more valuable than feedback on PDFs. |
| 9 | **Mobile?** | Sets v1.x scope. | Defer. Mobile is its own product surface. |
| 10 | **Domain + landing page** | Required for download link, updater endpoint. | Anything you own. A 1-page Astro site is a 1-day job during Phase E. |

## Things you (CEO) need to provision

When the time comes (I'll flag each at the relevant phase):

- An **Apple Developer Program** account ($99/yr) and `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` env vars (for notarization in CI).
- An **app icon** — 1024×1024 PNG, transparent.
- A **domain** for the auto-update endpoint and a landing page (or use GitHub Pages for both).
- An **OpenAI / Anthropic / Groq key for testing** (your dev key, not user-facing). I'll never commit them; they live in a local `.env` you give me.
- (Optional) **PostHog Cloud free tier** if we go with telemetry.
- A **logo / brand color** if you want the theme system to ship with a "brand" theme on top of light/dark.

## What I am NOT planning for v1.0

To keep scope honest:

- **Sync.** Local-first first. Sync is a v1.1 conversation, probably CRDT-based.
- **Plugin API.** Obsidian-style plugins are a multi-month investment.
- **Mobile.** Different product surface, different UX.
- **Web build.** The seams are there; one-file storage swap. v1.1.
- **Voice / audio transcription.** Cool, not core.
- **OCR.** Heptabase paywalls this and it's genuinely hard. v1.1+.
- **Real local embeddings (ONNX/WebGPU).** Interfaces are wired; actual model load is v1.1.
- **Per-block AI** beyond the AI palette. The palette is the v1.0 ceiling for AI surface area.

## How to read these files when working

Each step file follows the same skeleton:

> **Goal** · **Depends on** · **Scope** · **Implementation** · **Acceptance** · **Risks**

The contract is *that file*. If a step's scope changes mid-build, edit the file before changing code. CLAUDE.md is durable; plan/ is decision-of-record.

## Status

Last updated: 2026-04-26.
Phase A starts when you greenlight the decisions above.
