/**
 * Shared transcript-cleanup helpers used by both ingest paths
 * (CapturePreview / GraphImport). Pure: no React, no Tauri, no deps.
 *
 * Why this exists: real Claude.ai / ChatGPT 2024+ copy-paste output is
 * noisy. The earlier marker set required a literal `Word:` prefix
 * (`User:` / `Claude:`), which Claude.ai's clipboard format does not
 * produce. Real output looks like:
 *
 *   You said: 書き換えたいけど、どこのドキュメントを変えれ…
 *   excerpt_from_previous_claude_message.txt
 *   1 line
 *   txt
 *   書き換えたいけど、どこのドキュメントを変えれ…       ← duplicated
 *   2 May
 *   Claude responded: 書き換え対象を 5層 に分けると整理しやすい。…
 *   Created a file, read a file                            ← Claude.ai operation log
 *   Architected comprehensive knowledge file…              ← artifact thinking summary
 *   Architected comprehensive knowledge file…              ← duplicated
 *   <real content>
 *
 * `normalizeTranscript` strips the cosmetic noise (date stamps, file
 * metadata, operation logs, consecutive duplicates) before either
 * parser scans for role markers. The marker patterns themselves now
 * accept `You said:` / `Claude responded:` / `ChatGPT said:` etc. on
 * top of the legacy `User:` / `Assistant:` shapes.
 */

/** User-turn markers, multiline + global. Used by both `findRoleHits`-style
 *  scanners (Capture path) and `parseTurns` (GraphImport path). */
export const USER_MARK_PATTERNS: RegExp[] = [
  // Bold colon: **You:** / **User:** / **あなた:** / **ユーザー:**
  /^\s*\*\*\s*(?:You|User|あなた|ユーザー)\s*:\s*\*\*\s*/gim,
  // Plain colon: You: / User: / あなた: (followed by content on same line)
  /^\s*(?:You|User|あなた|ユーザー|私)\s*:\s+/gim,
  // Claude.ai / ChatGPT 2024+: "You said:" (optional content on same line)
  /^\s*(?:You|User)\s+said\s*:\s*/gim,
  // Japanese variants of "said:" — rare but worth covering.
  /^\s*(?:あなた|ユーザー|私)\s*が\s*(?:言いました|聞きました|質問しました)\s*[:：]?\s*/gim,
];

/** Assistant-turn markers. */
export const ASST_MARK_PATTERNS: RegExp[] = [
  // Bold colon: **ChatGPT:** / **Claude:** / **アシスタント:**
  /^\s*\*\*\s*(?:ChatGPT|Assistant|Claude|GPT|AI|アシスタント|Bot|Model|Gemini|Mistral)\s*:\s*\*\*\s*/gim,
  // Plain colon: ChatGPT: / Claude: / Assistant:
  /^\s*(?:ChatGPT|Assistant|Claude|GPT|AI|アシスタント|Bot|Model|Gemini|Mistral)\s*:\s+/gim,
  // Claude.ai 2024+: "Claude responded:" / "Claude said:" / "ChatGPT said:"
  /^\s*(?:ChatGPT|Assistant|Claude|GPT|AI|Bot|Model|Gemini|Mistral)\s+(?:said|responded|replied)\s*:\s*/gim,
];

/** Single multiline regex form (no /g) used by per-line `parseTurns`. */
export const TURN_MARKER_RE =
  /^\s*(?:user|human|me|q|質問|あなた|私|you)(?:\s+said)?\s*[:>]\s*/i;
export const REPLY_MARKER_RE =
  /^\s*(?:assistant|ai|bot|gpt|claude|model|reply|回答|chatgpt|gemini|mistral)(?:\s+(?:said|responded|replied))?\s*[:>]\s*/i;

/**
 * Normalise a pasted transcript: strip Claude.ai / ChatGPT cosmetic
 * noise so the role-marker scanner doesn't miss turns and the
 * collapsed-first-turn body doesn't get cluttered.
 */
export function normalizeTranscript(text: string): string {
  if (!text) return '';
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let lastTrimmed: string | null = null;
  for (const line of rawLines) {
    const trimmed = line.trim();

    if (isDateOnlyLine(trimmed)) continue;
    if (isArtifactMetadataLine(trimmed)) continue;
    if (isOperationLogLine(trimmed)) continue;

    // Dedupe consecutive identical non-empty lines. Claude.ai repeats
    // the artifact's "thinking summary" once before the real content,
    // and short user messages are echoed back after the file-attachment
    // metadata block.
    if (trimmed && trimmed === lastTrimmed) continue;

    out.push(line);
    if (trimmed) lastTrimmed = trimmed;
  }
  return out.join('\n');
}

/**
 * "2 May" / "May 2" / "1 January" / "5月2日". Date stamps inserted by
 * Claude.ai between turns. Always safe to drop — they are never real
 * conversation content because the chat format separates timestamps
 * onto their own line.
 */
function isDateOnlyLine(line: string): boolean {
  if (!line) return false;
  // English: "2 May", "May 2", "May 2, 2026"
  if (/^\d{1,2}\s+[A-Z][a-z]+(?:,\s*\d{4})?$/.test(line)) return true;
  if (/^[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?$/.test(line)) return true;
  // Japanese: "5月2日", "5月2日(土)"
  if (/^\d{1,2}月\d{1,2}日(?:[（(].[）)])?$/.test(line)) return true;
  return false;
}

/**
 * Claude.ai artifact previews paste with extra metadata blocks:
 *
 *     filename.txt
 *     1 line
 *     txt
 *     <body>
 *     ...
 *     Bakerization 戦略レビュー v2
 *     Document · MD
 *
 * The standalone format identifiers (`txt`, `MD`, `XLSX`), the
 * line-count summary (`1 line`, `12 lines`), and the
 * `<Kind> · <Format>` footer are all noise.
 */
function isArtifactMetadataLine(line: string): boolean {
  if (!line) return false;
  if (/^(?:txt|md|pdf|json|xlsx|csv|tsv|html|js|ts|tsx|jsx|py|rb|go|rs|md|markdown)$/i.test(line)) {
    return true;
  }
  if (/^\d+\s+lines?$/.test(line)) return true;
  if (/^(?:Document|Spreadsheet|Code|Image|Diagram)\s+·\s+\w+$/i.test(line)) {
    return true;
  }
  return false;
}

/**
 * Claude.ai's tool-use surface inserts operation summaries between the
 * model's words. They look like:
 *
 *     Created a file, read a file
 *     Ran 3 commands, created a file, read a file
 *     Architected comprehensive knowledge file capturing ...
 *
 * The "Architected ..." style is a thinking summary; we drop it because
 * it duplicates content the model is about to output anyway. The "Ran N
 * commands" style is pure tool log.
 */
function isOperationLogLine(line: string): boolean {
  if (!line) return false;
  // "Ran 3 commands, created a file, read a file"
  if (/^Ran\s+\d+\s+commands?(?:,\s+.+)?$/i.test(line)) return true;
  // "Created a file, read a file" / "Updated 2 files" / "Read a file"
  if (
    /^(?:Created|Read|Updated|Wrote|Edited|Ran|Searched|Browsed|Modified|Deleted)\s+(?:\d+\s+)?(?:a\s+|the\s+)?(?:file|files|commands?|search results?)\b/i.test(
      line,
    )
  ) {
    return true;
  }
  return false;
}
