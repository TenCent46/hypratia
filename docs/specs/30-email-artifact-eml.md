# 30 — Email Artifact (.eml + mailto)

Companion to [17-artifact-generation-pipeline.md](17-artifact-generation-pipeline.md).
Adds an email artifact path so the model can produce either a real
`.eml` file (RFC 5322) or a `mailto:` URL the host hands to the OS
default mail client.

## Why

Users frequently ask the chat to "draft an email to X about Y". Today
that draft only exists as Markdown in the chat. To get it into a real
mail client they have to copy/paste, lose formatting, and re-fill the
header fields by hand. We want one tool that lets the model produce
either:

- **a `.eml` file** the user double-clicks → opens in Mail.app /
  Outlook / Thunderbird with `To`, `Subject`, headers, and body
  already populated, or
- **a `mailto:` URL** the host opens via Tauri opener, which composes a
  new draft directly in the user's default mail client without
  touching disk.

`.eml` is text-only RFC 5322, so it sits naturally in the
text-artifact path — no provider sandbox, no binary plumbing.

## Architecture

```
features/chat ── tool call ──▶ services/llm/tools.ts (create_email_artifact)
                                     │
                                     ▼
                            services/artifacts/ArtifactService
                                     │
              ┌──────────────────────┴──────────────────────┐
              ▼                                              ▼
   delivery: 'file' (.eml)                          delivery: 'mailto'
   serialize → attachments.ingest                    build URL → opener
```

No new provider adapter — the host serializes RFC 5322 itself. No
network call. Works offline. No API key required.

## Type changes

```ts
// src/services/artifacts/types.ts

export type ArtifactKind =
  | 'text'
  | 'document'
  | 'audio'
  | 'video'
  | 'image'   // see spec 29
  | 'email';

export type EmailDelivery = 'file' | 'mailto';

export type EmailAddress = {
  email: string;
  name?: string;
};

// ArtifactRequest gains:
| {
    kind: 'email';
    delivery: EmailDelivery;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    from?: EmailAddress;
    replyTo?: EmailAddress;
    subject: string;
    bodyText: string;       // required, plain-text body
    bodyHtml?: string;      // optional, paired with bodyText as multipart/alternative
    date?: string;          // RFC 5322 / ISO; defaults to now
  }
```

`mailto` delivery returns an `ArtifactResultOk` with
`mimeType: 'text/uri-list'`, `extension: 'url'`, `sizeBytes: 0`, and a
new `openedUrl: string` field so the chat can re-open the URL on click.
File delivery is a normal text artifact with `extension: 'eml'`.

## Tool surface

```ts
create_email_artifact({
  delivery: 'file' | 'mailto',
  to: string | string[],     // accepted as raw or "Name <a@b>"
  subject: string,
  body: string,              // plain text or markdown
  bodyHtml?: string,
  cc?: string | string[],
  bcc?: string | string[],
  from?: string,
  replyTo?: string,
  filename?: string,         // defaults to <subject-slug>.eml
  saveToKnowledgeBase?: boolean,
  createCanvasNode?: boolean,
})
```

The tool description steers the model toward `.eml` for "save / file /
attach / archive" intents and toward `mailto:` for "open in mail / send
to / draft to / compose" intents. When the user asks "open a draft to
alice@…", the model should pick `mailto`.

`to` / `cc` / `bcc` accept either a single address or an array, with
either `"a@b.com"` or `"Alice <a@b.com>"` form. The host parses and
re-serializes — never trust the model's quoting.

## `.eml` serialization

RFC 5322 with these rules:

- All header values are encoded with **MIME encoded-word**
  (`=?UTF-8?B?...?=`) when they contain non-ASCII. Subject line is
  always encoded-word — Mail.app is fine with raw UTF-8 but Outlook
  is not.
- Address fields (`To`, `Cc`, `Bcc`, `From`, `Reply-To`) follow
  `Name <email@host>`, with `Name` encoded-word when needed.
- `Date` follows RFC 5322 (`Thu, 30 Apr 2026 09:12:34 +0900`) — use
  `toRFC5322Date(new Date())`.
- `Message-ID` is generated as `<{nanoid}@hypratia.local>`.
- `MIME-Version: 1.0` always present.
- When only `bodyText` is provided: `Content-Type: text/plain;
  charset=UTF-8` plus `Content-Transfer-Encoding: 8bit` for short
  bodies, `quoted-printable` for bodies that contain long lines or
  control chars.
- When `bodyHtml` is also provided: `Content-Type:
  multipart/alternative; boundary=...` with two parts (`text/plain`
  then `text/html`), each with its own
  `Content-Transfer-Encoding`.
- Line endings are CRLF. We normalize the model's `\n` on the way in.

The serializer lives in a new file
`services/artifacts/email/eml.ts`. It exports
`serializeEml(req): string` and pure helper functions
(`encodeWord`, `formatAddress`, `toRFC5322Date`,
`encodeQuotedPrintable`). Keep it in the artifacts service so it stays
testable without touching Tauri.

## `mailto:` serialization

Structure: `mailto:<to>?subject=<...>&cc=<...>&bcc=<...>&body=<...>`.

- Each address list is comma-joined and the whole field is
  `encodeURIComponent`'d.
- `subject` and `body` are `encodeURIComponent`'d. Newlines in the
  body become `%0D%0A` (CRLF), which Mail.app and Outlook both honor.
- We hard-cap the URL at **2000 chars total** (Outlook's documented
  ceiling; Mail.app accepts much more, but we want one rule). If the
  built URL exceeds 2000 chars, the tool returns
  `{ ok: false, error: 'mailto-too-long', hint: 'use delivery: file' }`
  so the model can fall back to `.eml` automatically.
- `bodyHtml` is ignored for `mailto` — the URL scheme has no HTML
  channel. We log a warning in the tool result so the user knows the
  HTML did not survive.

The host opens the URL via the existing dialog/opener service:
`services/dialog` already wraps `@tauri-apps/plugin-opener`'s
`openUrl`. No new platform import.

## Storage contract

| Delivery | Bytes location                         | KB mirror                                  |
| -------- | -------------------------------------- | ------------------------------------------ |
| file     | `attachments/YYYY-MM/<id>.eml`         | text artifact under `Artifacts/<YYYY-MM>/` (`.eml` stays alongside its sidecar) |
| mailto   | nothing on disk                         | nothing                                     |

`.eml` is **added to `TEXT_EXTENSIONS`** in
[`services/artifacts/filenames.ts`](../../src/services/artifacts/filenames.ts)
so the existing text path picks it up. MIME for `.eml` is
`message/rfc822`; add a `TEXT_MIME_BY_EXT` entry. Knowledge-base
mirroring writes the raw `.eml` body verbatim — no re-rendering — and
adds a sidecar `.md` with `artifactType: email` plus a parsed copy of
the headers and body for grep'ability.

## UI

### Chat artifact card

For `kind: 'email'`:

- File delivery: shows envelope icon, subject as title, recipient list
  as subtitle, size. Buttons: **Open in Mail** (Tauri opener on the
  `.eml`, which on macOS launches Mail.app's import flow) ·
  **Reveal in Finder** · **Copy as mailto** (rebuilds the mailto and
  copies it to the clipboard).
- mailto delivery: shows envelope icon, subject as title, "Compose
  draft → <client>" CTA. Buttons: **Open draft** (re-runs the URL),
  **Copy mailto**, **Save as .eml** (re-serializes with delivery:
  file and ingests).

### Canvas

`.eml` files render through the existing `ArtifactNode` (generic
binary card). `mailto` results do **not** add a canvas node by default
— there's no file. `createCanvasNode: true` with `delivery: 'mailto'`
returns `{ ok: false, error: 'mailto-has-no-canvas-node' }`.

## Privacy / safety

- The tool **never sends mail**. It only writes a file or hands a URL
  to the OS. SMTP, IMAP, OAuth flows are explicitly out of scope.
- `Bcc:` is honored in `.eml` exactly as the model wrote it. Mail
  clients vary on whether they strip `Bcc` on send — we keep the
  field as-authored so the user sees what the model intended.
- No tracking pixels, no remote images injected into `bodyHtml` by
  the host. If the model writes `<img src="https://...">`, that goes
  through verbatim.
- Address lists are not validated against any address book; we only
  check that they look like `local@domain.tld` so a typo doesn't
  produce a malformed `.eml`.

## Hard rules

- All RFC 5322 serialization happens inside
  `services/artifacts/email/eml.ts`. No other file knows the
  on-the-wire format.
- `mailto` URL building lives next to it
  (`services/artifacts/email/mailto.ts`) and is unit-testable without
  Tauri.
- `to` is required and non-empty. A missing `to` is a tool-arg error
  before any serialization.
- `subject` is required; we do not silently default to "(no
  subject)".
- The 2000-char cap on `mailto` is enforced at the artifact-service
  layer, not the tool layer, so the file fallback path can produce
  the same hint.
- No external HTTP. This tool is offline-clean.

## Acceptance

1. `pnpm tsc --noEmit` clean after `ArtifactKind` extension.
2. Asking the chat to "draft an email to alice@example.com about Q3
   plans, save as .eml" produces a real `.eml` under
   `attachments/YYYY-MM/`. Double-clicking it opens Mail.app with
   `To`, `Subject`, and body filled in.
3. Asking "open a draft to alice@example.com about Q3 plans" produces
   a `mailto` URL that opens the user's default mail client with
   the same fields, and the artifact card shows the **Open draft**
   button.
4. UTF-8 subjects (`件名: 月次レポート`) round-trip cleanly through
   both Mail.app and Outlook from the saved `.eml`.
5. A `mailto` URL longer than 2000 chars returns
   `error: 'mailto-too-long'` with a `hint` recommending `.eml`. The
   chat surfaces the hint and the model retries with
   `delivery: 'file'`.
6. `.eml` files appear in the local Markdown search results when
   `mirrorTextToKnowledgeBase` is on (matching against the sidecar
   `.md`, not the raw RFC 822).
7. The tool is registered unconditionally — no API key requirement.

## Out of scope

- Actually **sending** the email (SMTP, OAuth, Gmail / Outlook /
  iCloud APIs). The tool stops at "drafted".
- Calendar invites (`text/calendar`, `.ics` parts in
  `multipart/alternative`). Future spec.
- S/MIME or PGP signing. Future spec; would slot in by adding a
  `signing?: 'none' | 'smime' | 'pgp'` field on the request.
- Multipart bodies beyond `text/plain` + `text/html`. Inline images
  and `multipart/related` come with the calendar / signing work.
- Address-book autocompletion. The model writes the address; the
  user proofreads.
- A "send via Gmail" path that uses the Gmail MCP connector
  configured in this repo's tooling — that lives outside the
  artifact pipeline by design.
