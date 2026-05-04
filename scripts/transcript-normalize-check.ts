/**
 * Acceptance tests for `transcriptNormalize` + the Claude.ai / ChatGPT
 * 2024+ marker patterns. Plan/v1/31 follow-up.
 *
 * Run with `pnpm check:transcript-normalize`.
 */

import assert from 'node:assert/strict';
import {
  detectAIConversation,
  parsePastedConversation,
} from '../src/services/capture/PasteCapture.ts';
import {
  pairTurns,
  parseTurns,
} from '../src/services/graphBuilder/conversationAssembly.ts';
import {
  normalizeTranscript,
} from '../src/services/capture/transcriptNormalize.ts';

let passed = 0;

function section(label: string) {
  console.log(`\n— ${label}`);
}

async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// =====================================================================
// Realistic Claude.ai copy fixture (paraphrased + trimmed from the
// user's bug report so the test stays self-contained and copy-safe).
// Keeps the structural shape: artifact-summary repeats, file-attachment
// metadata blocks, date stamps, "You said:" / "Claude responded:".
// =====================================================================

const CLAUDE_FIXTURE = [
  'Architected comprehensive knowledge file capturing flagship strategy',
  'Architected comprehensive knowledge file capturing flagship strategy',
  'Knowledge ファイルとしてまとめます。今回の更新は戦略の根幹的な転換を含んでいるので、正直に分ける方針で書きます。',
  'Created a file, read a file',
  'Created a file, read a file',
  'まとめました。記録しながら、ブランド戦略家として気づいた戦略上の引っかかりを4点だけ挙げておきます。',
  '',
  'You said: 書き換えたいけど、どこのドキュメントを変えれば良いの',
  'excerpt_from_previous_claude_message.txt',
  '1 line',
  'txt',
  '書き換えたいけど、どこのドキュメントを変えれば良いの',
  '2 May',
  'Claude responded: 書き換え対象を 5層 に分けると整理しやすい。それぞれ「触るべき優先度」が違う。',
  '戦略転換に伴う文書更新の優先順位を階層化した。',
  '戦略転換に伴う文書更新の優先順位を階層化した。',
  'You said: v2に書き換えて',
  'v2に書き換えて',
  '2 May',
  'Claude responded: v2 を書き上げました。v1 の章立てを保ったまま、ミキサー再定義と原宿フラグシップ中心戦略に書き換えています。',
  'Bakerization 戦略レビュー v2',
  'Document · MD',
].join('\n');

// =====================================================================
// normalizeTranscript
// =====================================================================

section('normalizeTranscript — noise stripping');

await check('drops consecutive duplicate non-empty lines', () => {
  const cleaned = normalizeTranscript('hello\nhello\nworld');
  assert.equal(cleaned, 'hello\nworld');
});

await check('drops English date-only stamps like "2 May"', () => {
  const cleaned = normalizeTranscript('content\n2 May\nmore content');
  assert.equal(cleaned, 'content\nmore content');
});

await check('drops Japanese date-only stamps like "5月2日"', () => {
  const cleaned = normalizeTranscript('content\n5月2日\nmore content');
  assert.equal(cleaned, 'content\nmore content');
});

await check('drops standalone format identifiers ("txt", "MD", "XLSX")', () => {
  const cleaned = normalizeTranscript('body\ntxt\nmore body\nMD\nend');
  assert.equal(cleaned, 'body\nmore body\nend');
});

await check('drops "1 line" / "12 lines" summaries', () => {
  const cleaned = normalizeTranscript('header\n1 line\nbody\n12 lines\ntail');
  assert.equal(cleaned, 'header\nbody\ntail');
});

await check('drops "Document · MD" / "Spreadsheet · XLSX" footers', () => {
  const cleaned = normalizeTranscript(
    'Bakerization 戦略レビュー v2\nDocument · MD\nnext content',
  );
  assert.equal(cleaned, 'Bakerization 戦略レビュー v2\nnext content');
});

await check('drops "Created a file, read a file" operation logs', () => {
  const cleaned = normalizeTranscript(
    'before\nCreated a file, read a file\nafter',
  );
  assert.equal(cleaned, 'before\nafter');
});

await check('drops "Ran 3 commands, created a file, read a file"', () => {
  const cleaned = normalizeTranscript(
    'before\nRan 3 commands, created a file, read a file\nafter',
  );
  assert.equal(cleaned, 'before\nafter');
});

await check('preserves blank lines (turn separators)', () => {
  const cleaned = normalizeTranscript('a\n\nb');
  assert.equal(cleaned, 'a\n\nb');
});

await check('does not drop legitimate content that mentions txt / files', () => {
  // Regression guard: lines like "save it as a .txt file" must survive.
  const cleaned = normalizeTranscript(
    'Please save the report as a .txt file and email me.',
  );
  assert.match(cleaned, /save the report as a \.txt file/);
});

// =====================================================================
// detectAIConversation — Claude.ai copy now clears the threshold
// =====================================================================

section('detectAIConversation — Claude.ai 2024+ format');

await check(
  'Claude-style transcript ("You said:" / "Claude responded:") detected at >= 0.6',
  () => {
    const { confidence, format } = detectAIConversation(CLAUDE_FIXTURE);
    assert.ok(
      confidence >= 0.6,
      `expected confidence >= 0.6, got ${confidence}`,
    );
    assert.equal(format, 'claude-share');
  },
);

await check(
  'pure prose without role markers stays low-confidence',
  () => {
    const prose = 'This is a paragraph about something. '.repeat(20);
    const { confidence } = detectAIConversation(prose);
    assert.ok(confidence < 0.5);
  },
);

await check('legacy "User: / Assistant:" format still detected', () => {
  const legacy = [
    'User: What is the weather like today in Tokyo?',
    'Assistant: It is sunny and warm, around 25 degrees.',
    'User: Should I bring a jacket if I go out tonight?',
    'Assistant: A light jacket would be reasonable for the evening.',
  ].join('\n\n');
  const { confidence } = detectAIConversation(legacy);
  assert.ok(confidence >= 0.6, `legacy format: confidence ${confidence}`);
});

// =====================================================================
// parsePastedConversation — Claude.ai turns are extracted correctly
// =====================================================================

section('parsePastedConversation — Claude.ai fixture');

await check('extracts both user turns from "You said:" markers', () => {
  const parsed = parsePastedConversation(CLAUDE_FIXTURE);
  const userTurns = parsed.turns.filter((t) => t.role === 'user');
  assert.equal(userTurns.length, 2);
  assert.match(userTurns[0].content, /書き換えたいけど/);
  assert.match(userTurns[1].content, /v2に書き換えて/);
});

await check('extracts both assistant turns from "Claude responded:"', () => {
  const parsed = parsePastedConversation(CLAUDE_FIXTURE);
  const asstTurns = parsed.turns.filter((t) => t.role === 'assistant');
  assert.ok(asstTurns.length >= 2);
  // The last two assistant turns should be the "Claude responded:" outputs.
  const last2 = asstTurns.slice(-2);
  assert.match(last2[0].content, /5層|文書更新/);
  assert.match(last2[1].content, /v2 を書き上げました|フラグシップ/);
});

await check('user turn body is not contaminated with file metadata', () => {
  const parsed = parsePastedConversation(CLAUDE_FIXTURE);
  const userTurns = parsed.turns.filter((t) => t.role === 'user');
  // Shouldn't contain "1 line" / "txt" / "2 May" / "excerpt_from_previous"
  for (const t of userTurns) {
    assert.doesNotMatch(t.content, /^1 lines?$/m);
    assert.doesNotMatch(t.content, /^txt$/im);
    assert.doesNotMatch(t.content, /^2 May$/im);
  }
});

await check(
  'duplicated artifact-summary lines inside an assistant turn collapse',
  () => {
    const parsed = parsePastedConversation(CLAUDE_FIXTURE);
    const asstTurns = parsed.turns.filter((t) => t.role === 'assistant');
    // First "Claude responded:" turn has the duplicated
    // "戦略転換に伴う文書更新の優先順位を階層化した。" line — should appear once.
    const firstResponded = asstTurns.find((t) => t.content.includes('5層'));
    assert.ok(firstResponded);
    const occurrences =
      firstResponded!.content.match(/戦略転換に伴う文書更新の優先順位を階層化した。/g) ?? [];
    assert.equal(occurrences.length, 1);
  },
);

// =====================================================================
// parseTurns (GraphImport path) — matches the same patterns
// =====================================================================

section('parseTurns — Claude.ai fixture');

await check(
  'parseTurns extracts user + assistant pairs from Claude.ai fixture',
  () => {
    const turns = parseTurns(CLAUDE_FIXTURE);
    const userTurns = turns.filter((t) => t.role === 'user');
    const asstTurns = turns.filter((t) => t.role === 'assistant');
    assert.equal(userTurns.length, 2);
    assert.ok(asstTurns.length >= 2);
  },
);

await check('pairTurns wires each Claude.ai user turn to its reply', () => {
  const turns = parseTurns(CLAUDE_FIXTURE);
  const pairs = pairTurns(turns);
  assert.equal(pairs.length, 2);
  assert.match(pairs[0].user.content, /書き換えたいけど/);
  assert.ok(pairs[0].assistant);
  assert.match(pairs[0].assistant!.content, /5層|文書更新/);
  assert.match(pairs[1].user.content, /v2に書き換えて/);
  assert.ok(pairs[1].assistant);
});

// =====================================================================
// ChatGPT 2024+ format ("You said:" / "ChatGPT said:")
// =====================================================================

section('ChatGPT 2024+ format');

const CHATGPT_FIXTURE = [
  'You said: How do I cite a paper in APA format?',
  'ChatGPT said: To cite a paper in APA format, use this template: Author, A. A. (Year). Title.',
  'You said: What about a website?',
  'ChatGPT said: For a website, include the author, the date, the title and the URL.',
].join('\n\n');

await check('ChatGPT "You said:" / "ChatGPT said:" detected', () => {
  const { confidence, format } = detectAIConversation(CHATGPT_FIXTURE);
  assert.ok(confidence >= 0.6, `confidence: ${confidence}`);
  assert.equal(format, 'chatgpt-share');
});

await check('ChatGPT fixture parses into 2 user + 2 assistant turns', () => {
  const parsed = parsePastedConversation(CHATGPT_FIXTURE);
  const userTurns = parsed.turns.filter((t) => t.role === 'user');
  const asstTurns = parsed.turns.filter((t) => t.role === 'assistant');
  assert.equal(userTurns.length, 2);
  assert.equal(asstTurns.length, 2);
});

console.log(`\n✓ ${passed} transcript-normalize checks passed.\n`);
