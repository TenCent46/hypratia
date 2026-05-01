# 20 — Secrets and settings

**Goal:** API keys live in the OS keychain. A real Settings tab lets the user manage providers, models, theme, vault, daily-notes folder, and (future) telemetry preference.

**Depends on:** 16, 19.

## Storage decision

**`tauri-plugin-keyring`** wrapping the Rust `keyring` crate. Reasons (full research in `plan/v1/README.md`):

- Stronghold is being deprecated in Tauri v3.
- Keychain is what users already trust on macOS; no extra password to manage.
- Simpler API surface for our use case (a handful of secrets, not a vault).

Keychain service id: `com.bakerization.memory-canvas`. Account names: `provider:<id>` (e.g. `provider:openai`, `provider:anthropic`, `provider:groq`).

Linux fallback: if no libsecret, use AES-256-GCM encrypted file at `<appData>/secrets.bin` keyed by a OS-prompted password (only on first save).

## New service

`src/services/secrets/`:

```ts
interface SecretsService {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

Add to platform-leak allowlist (only `services/secrets/` may import keyring plugin).

## Settings tab redesign

Replaces `SettingsModal`. New shape: a multi-section panel (still a modal at v1.0; can become a route later).

Sections:

1. **Providers & API keys** — list of providers, each with a key field (password-style), "Test" button, "Last verified" timestamp, "Remove" button.
2. **Default model** — dropdown filtered by configured providers.
3. **Appearance** — theme dropdown, accent color, font scale (90 / 100 / 115 %), serif vs sans for node titles.
4. **Vault & data** — Obsidian vault path picker; reveal app data folder; export now button (existing).
5. **Daily notes** — folder name (default `LLM-Daily/`), template path (optional).
6. **Updates** — version, "Check for updates", channel (stable / beta).
7. **Privacy** — telemetry toggle (default OFF for v1.0; reserved for v1.1+).
8. **Danger zone** — "Reset all settings" (does not touch chat data), "Delete all attachments" (with confirm).

UI uses the new theme tokens. Keep it as a **modal** for now — converting to a router (`/settings`) is a small refactor we can do post-v1.0 if it becomes deep enough.

## Provider config

`src/services/llm/providers.ts` defines the static metadata; user-configurable values (key, custom base URL) live in `settings.providers`:

```ts
type ProviderId = 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'openai-compatible' | 'ollama';

type ProviderConfig = {
  id: ProviderId;
  enabled: boolean;
  baseUrl?: string;     // for openai-compatible / ollama / proxies
  defaultModel?: string;
};
```

Keys never live in `settings.json`. Only `enabled` + `baseUrl` + `defaultModel` do. The key is in keychain.

## Acceptance

- Paste a key, click Test → in <2 s, "✅ verified · gpt-4o-mini" appears (a single 4-token completion request).
- Quit, relaunch, reopen Settings → key field shows `••••••••` placeholder; "Test" still works (the actual key is fetched from keychain on demand).
- macOS Keychain Access shows the entry under "memory-canvas".
- Providers without a key don't appear in the model dropdown anywhere else in the app.

## Risks

- macOS first-run prompt: keychain may ask "always allow" for the app — surface this in the empty state, not as an error.
- Providers with the same model name across sub-orgs (Azure OpenAI etc.) — out of scope; v1.0 only direct-to-provider endpoints + Ollama + OpenAI-compatible.
- Test endpoint cost: keep to 1 input token, 1 output token — sub-cent.
- Keychain plugin returns errors on the linux fallback path; we degrade silently to encrypted file with a one-time password prompt.
