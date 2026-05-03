<div align="center">
  <img src="public/hypratia-icon.svg" alt="Hypratia logo" width="96" height="96" />

  <h1>Hypratia — Open-Source AI Workspace for Your LLM Conversations</h1>

  <p>
    <b>Local-first. Mac-native. Bring-your-own-key.</b><br/>
    A spatial memory canvas that turns ChatGPT, Claude, Gemini and Mistral chats into a searchable, exportable knowledge base — stored as plain Markdown on your own disk.
  </p>

  <p>
    <a href="LICENSE"><img alt="License: AGPL v3" src="https://img.shields.io/badge/license-AGPLv3-blue.svg" /></a>
    <a href="COMMERCIAL-LICENSE.md"><img alt="Commercial License available" src="https://img.shields.io/badge/commercial%20license-available-success.svg" /></a>
    <img alt="Version" src="https://img.shields.io/badge/version-v1.1.0--beta.1-orange.svg" />
    <img alt="Platform" src="https://img.shields.io/badge/platform-macOS-lightgrey.svg" />
    <img alt="Built with Tauri 2" src="https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-61dafb.svg" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6.svg" />
  </p>

  <p>
    <b>English</b> · <a href="README.ja.md">日本語</a>
  </p>
</div>

---

## What is Hypratia

**Hypratia** is an open-source, local-first AI productivity app for people who live inside LLM chats. The right pane is a familiar streaming chat. The left pane is an infinite canvas where every message — yours, the model's, a quoted PDF passage, a daily note — drops as a draggable Markdown node you can rearrange, link, distill, and export.

Think of it as **a second brain that speaks AI**: capture the conversation, distill the answer, map it next to related ideas, then export the whole thing as plain Markdown into your Obsidian vault. No cloud sync. No telemetry. Your keys, your files, your machine.

> Capture → Distill → Map → Export.

## Why Hypratia

If you have ever felt one of these, Hypratia is built for you:

- **"My ChatGPT history is a graveyard."** Threads scroll off; good answers vanish; you can't find that prompt from three weeks ago.
- **"Claude Projects and Notion AI are great — but my data lives on someone else's server."** You want full local control, plain files, and no vendor lock-in.
- **"I want one app that talks to OpenAI, Anthropic, Gemini, Mistral, Groq and my local Ollama, with one keyboard-driven UI."**
- **"I want my AI workspace to be Obsidian-compatible out of the box."** Wikilinks, frontmatter, daily notes, the whole vault convention.
- **"I don't want a chatbot. I want a thinking surface."** Spatial layout, infinite canvas, drag from chat to canvas, link nodes, transclude, distill.

Hypratia is positioned as a **local-first alternative to ChatGPT Canvas, Claude Projects, Notion AI, and proprietary AI desktop apps** — with the file format and UX expectations of an Obsidian power user.

## Features

### AI conversation, multi-provider
- **Streaming chat** with OpenAI (GPT-5/4o/4.1), Anthropic (Claude Sonnet/Opus/Haiku), Google Gemini, Mistral, Groq, any **OpenAI-compatible** endpoint, and **local Ollama** — all behind a single Vercel AI SDK boundary.
- **Bring-your-own-key (BYOK)**: keys live on your Mac under FileVault-protected app data, never on a Hypratia server. There is no Hypratia server.
- **Per-conversation model override**, token-usage roll-up, and a live cost meter.
- **Regenerate**, **stop**, **explicit search / deep-research modes** — the app never pretends it browsed when no provider is wired.

### Spatial canvas for thought
- **Infinite canvas** powered by `@xyflow/react`, with 4-direction handles, marquee selection, and zoom-to-fit.
- **Drag any chat message onto the canvas** to turn it into a Markdown node you can edit, link, and re-prompt against.
- **AI palette on selection (`Cmd+J`)**: Improve / Summarize / Expand / Extract / Question / custom prompt — the result becomes a new linked node.
- **PDF, image, and document nodes**: drop a PDF in, text-select inside the viewer, and one click turns the highlight into a card with `pdfRef` frontmatter and a back-edge to the source page.
- **Wikilinks `[[id|alias]]`** and **transclusion `![[id]]`** with cycle detection.
- **Editable free-form YAML frontmatter** on every node.

### Knowledge base, your way
- **Per-project knowledge folders** (`raw/`, `instruction/`, `processed/`) keep source PDFs, AI instructions, long-term memory, and machine-generated indexes cleanly separated.
- **Daily notes (`Cmd+D`)**, **Inbox quick-capture (`Cmd+Shift+Space`)**, **template variables** (`{{date}}`, `{{title}}`, …).
- **Command palette (`Cmd+P`)**, **search (`Cmd+K`)**, **cheat-sheet (`Cmd+?`)** — every action is keyboard-reachable.

### Obsidian-compatible export
- One shortcut (`Cmd+Shift+E`) writes the active workspace into a folder structure any Obsidian vault understands: `LLM-Conversations/`, `LLM-Daily/`, `LLM-Nodes/`, `LLM-Maps/`, `LLM-Attachments/`.
- Conversations and nodes export as **plain Markdown with YAML frontmatter** — no proprietary database, no migration tax.
- **Atomic writes** (tmp-file + rename, debounced 300 ms) so an interrupted save never corrupts your vault.

### Privacy by design
- **Zero telemetry.** Zero analytics. Zero "anonymous" pings.
- The only network calls are (1) requests you make to AI providers you configured, and (2) GitHub Release checks when the auto-updater is enabled.
- Source-available under **AGPLv3** — you can audit every line, fork it, or self-host it.

## Quick start

```bash
git clone https://github.com/TenCent46/hypratia.git
cd hypratia
pnpm install
pnpm tauri dev
```

Then in the app:

1. Open **Settings → Providers**.
2. Paste an API key for OpenAI, Anthropic, Google, Mistral, Groq, an OpenAI-compatible endpoint, or point it at a local **Ollama**.
3. Press **Test** to verify the connection.
4. `Cmd+N` for a new conversation, `Cmd+Enter` to send.

### Build a macOS DMG

```bash
pnpm tauri build                                   # universal
pnpm tauri build --target aarch64-apple-darwin     # Apple Silicon
pnpm tauri build --target x86_64-apple-darwin      # Intel
```

Output lands in `src-tauri/target/release/bundle/dmg/` (or under the target-specific path for explicit architectures).

## Supported AI providers

| Provider | Streaming | Tool calls | Local |
|---|---|---|---|
| OpenAI (GPT family) | yes | yes | no |
| Anthropic (Claude family) | yes | yes | no |
| Google Gemini | yes | yes | no |
| Mistral | yes | yes | no |
| Groq | yes | yes | no |
| Any OpenAI-compatible endpoint | yes | yes | depends |
| Ollama (local models) | yes | partial | **yes** |

You can mix and match per conversation — e.g. draft with a fast Groq model, then re-run the same prompt against Claude Opus for the deep pass.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Command palette | `Cmd+P` |
| Search | `Cmd+K` |
| AI palette on selection | `Cmd+J` |
| Today's daily note | `Cmd+D` |
| Quick capture | `Cmd+Shift+Space` |
| All shortcuts | `Cmd+?` |
| Settings | `Cmd+,` |
| New conversation | `Cmd+N` |
| Add empty node | `Cmd+E` |
| Toggle Current/Global map | `Cmd+G` |
| Center viewport | `Cmd+0` |
| Select / Hand tool | `V` / `H` |
| Toggle Inspect/Chat | `Cmd+Shift+I` |
| Export to vault | `Cmd+Shift+E` |
| Send / Stop | `Cmd+Enter` / `Cmd+Backspace` |

## Use cases

- **Research assistant.** Drop a stack of PDFs into `raw/`, ask Claude or GPT to summarize, click any citation to jump back to the exact page.
- **Long-form writing.** Outline on the canvas, draft in chat, distill the best paragraphs into nodes, export to Obsidian when it ships.
- **Codebase companion.** Paste error logs, get explanations, save the canonical fix as a linked node so the next time it happens you grep your own vault first.
- **Study and learning.** Daily notes plus AI-generated flashcards plus the source PDF, all in one infinite canvas.
- **Meeting and decision log.** Capture transcripts, distill action items, export the map next to your project knowledge base.
- **Second brain.** Years of LLM conversations as a navigable, searchable, offline knowledge graph instead of a scroll-locked chat history.

## Tech stack

- **Shell:** [Tauri 2](https://tauri.app/) — native webview, tiny Rust core, no Electron.
- **UI:** React 19 + TypeScript 5 + Vite 7.
- **Canvas:** [`@xyflow/react`](https://reactflow.dev/) (React Flow).
- **State:** [Zustand](https://github.com/pmndrs/zustand).
- **Markdown:** `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight`. KaTeX for math, highlight.js for code.
- **AI gateway:** [Vercel AI SDK](https://sdk.vercel.ai/) wrapping OpenAI / Anthropic / Google / Mistral / Groq / OpenAI-compatible / Ollama.
- **PDF:** `react-pdf` + `pdfjs-dist` with text-layer selection.
- **Editor:** CodeMirror 6 with Markdown language support.
- **Command palette:** [`cmdk`](https://cmdk.paco.me/).
- **Persistence:** atomic per-entity JSON files in Tauri `appDataDir()`.

## Project knowledge folder layout

```text
knowledge-base/
  projects/
    [project-name]/
      raw/           # source PDFs, DOCX, Markdown, txt, csv
      instruction/
        instruction.md       # AI instructions for this project
        memory.md            # decisions, user preferences, long-term memory
        meta-instruction.md  # short rules for retrieval & citation
      processed/     # extracted text, chunks, indexes (machine-written)
```

Keep raw sources in `raw/`, AI guidance in `instruction/`, and machine-generated indexes in `processed/` — never stuff long PDFs into `memory.md`.

## Local data layout

App data lives under Tauri's `appDataDir()` (on macOS, typically `~/Library/Application Support/com.bakerization.memory-canvas/`):

- `conversations.json`, `messages.json`, `nodes.json`, `edges.json`
- `settings.json`, `attachments.json`, `secrets.json`
- `attachments/YYYY-MM/<id>.<ext>`
- `LLM-Conversations/`, `LLM-Daily/`, `LLM-Nodes/`, `LLM-Maps/`, `LLM-Attachments/`

## Development

```bash
pnpm install                # install dependencies
pnpm tauri dev              # desktop dev shell
pnpm dev                    # Vite-only (browser dev, limited features)
pnpm build                  # tsc + Vite production build
pnpm typecheck              # TypeScript type check
pnpm lint                   # ESLint
pnpm check:knowledge        # smoke-test knowledge retrieval
pnpm tauri build            # macOS .app + .dmg
```

See [CLAUDE.md](CLAUDE.md) for the architecture rules every contributor is expected to follow (service boundaries, atomic writes, single Markdown render surface, etc.).

## Roadmap

Hypratia is in **v1.1.0-beta.1**. Tracked next:

- OS-keychain-backed secrets via `tauri-plugin-keyring` (currently FileVault-protected plaintext under `appData/`).
- OS-level global shortcut for quick capture (in-app `Cmd+Shift+Space` already works).
- Auto-updater (config scaffolded, currently disabled).
- Apple Developer signing in CI.
- Windows build pass.
- Web build via single storage-adapter swap.
- Optional, opt-in **L2 / L3** AI summarization layer.

See [CHANGELOG.md](CHANGELOG.md) for shipped work and [plan/](plan/README.md) for the long-form roadmap.

## Contributing

Pull requests welcome. Before opening one:

1. Read [CLAUDE.md](CLAUDE.md) — it documents the **service boundaries** that keep Hypratia portable to Windows and the web (only `services/storage|export|dialog|secrets|attachments|llm|shortcut/` may import `@tauri-apps/*`).
2. `pnpm typecheck && pnpm lint` must be clean.
3. New features that touch storage need an atomic-write path and a per-entity JSON file (no monolith blobs).
4. Don't put export logic in components — once Markdown lives in user vaults, the format is contractual.

Bug reports and feature requests: [GitHub Issues](https://github.com/TenCent46/hypratia/issues).

## Privacy

- **No telemetry.** Ever.
- Outbound network is limited to AI providers you configured plus GitHub Release checks when the updater is on.
- API keys are stored locally; v1.0-beta uses a FileVault-protected plaintext file in app data, v1.0 final swaps to the OS keychain.

## License

Hypratia Core is released under the **[GNU AGPLv3](LICENSE)**.

The **Hypratia name, logo, brand identity, website, design assets, official signed builds, and the commercial Pro / Enterprise extensions are not covered by AGPLv3** and remain reserved to the Hypratia project. Forks of Hypratia Core under AGPLv3 must use a different name and branding.

A **Commercial License** is available for closed-source embedding, AGPLv3 §13 exemptions for network services, support contracts, and Enterprise deployments — see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

## Acknowledgements

Hypratia stands on the shoulders of [Tauri](https://tauri.app/), [React](https://react.dev/), [React Flow](https://reactflow.dev/), [Vercel AI SDK](https://sdk.vercel.ai/), [Obsidian](https://obsidian.md/) (for setting the Markdown-vault standard), and the broader local-first software community.

---

<sub>
Keywords: open source AI workspace, local-first LLM app, ChatGPT alternative, Claude Projects alternative, Notion AI alternative, Obsidian AI plugin, AI second brain, infinite canvas chat, BYOK AI desktop, Mac AI productivity tool, multi-provider LLM client, OpenAI Anthropic Gemini Mistral Groq Ollama, PDF chat, knowledge management, self-hosted AI, AGPL AI app, Tauri React TypeScript.
</sub>

<!--
Suggested GitHub topics (set under "About" on the repo page):
ai, llm, openai, anthropic, claude, gemini, mistral, groq, ollama, chatgpt-alternative,
claude-projects-alternative, notion-ai-alternative, local-first, privacy, obsidian,
markdown, knowledge-management, second-brain, productivity, infinite-canvas,
react-flow, tauri, react, typescript, macos, desktop-app, byok, ai-workspace,
ai-chat, pdf-chat
-->
