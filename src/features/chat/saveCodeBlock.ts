import { artifacts, extensionForLanguageHint } from '../../services/artifacts';

const FENCE_RE = /```(\w+)?\s*\n([\s\S]*?)```/g;

export type FencedBlock = {
  language?: string;
  code: string;
};

export function extractFencedBlocks(markdown: string): FencedBlock[] {
  const out: FencedBlock[] = [];
  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(markdown))) {
    out.push({ language: m[1] || undefined, code: m[2] });
  }
  return out;
}

export async function saveBlockAsArtifact(
  block: FencedBlock,
  conversationId: string,
  index: number,
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  const ext = extensionForLanguageHint(block.language);
  const defaultName = `snippet-${index + 1}.${ext}`;
  const proposed = window.prompt('Save snippet as filename', defaultName);
  if (!proposed) return { ok: false, error: 'cancelled' };
  const result = await artifacts.create({
    kind: 'text',
    conversationId,
    filename: proposed,
    textContent: block.code,
    language: block.language,
    saveToKnowledgeBase: ext === 'md',
    createCanvasNode: ext === 'md',
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, filename: result.filename };
}

/**
 * Pick one of the fenced blocks via window.prompt, then save it. Returns
 * undefined when the user cancels. Used by the per-message
 * "Save code as file…" button.
 */
export async function saveFencedBlocksFromMessage(
  markdown: string,
  conversationId: string,
): Promise<string | undefined> {
  const blocks = extractFencedBlocks(markdown);
  if (blocks.length === 0) {
    window.alert('No fenced code blocks found in this message.');
    return undefined;
  }
  let chosen = 0;
  if (blocks.length > 1) {
    const list = blocks
      .map((b, i) => `${i + 1}. ${b.language ?? 'text'} (${b.code.length} chars)`)
      .join('\n');
    const picked = window.prompt(
      `Which block to save?\n\n${list}\n\nEnter number 1-${blocks.length}:`,
      '1',
    );
    if (!picked) return undefined;
    const n = Number.parseInt(picked, 10);
    if (!Number.isFinite(n) || n < 1 || n > blocks.length) return undefined;
    chosen = n - 1;
  }
  const res = await saveBlockAsArtifact(blocks[chosen], conversationId, chosen);
  if (!res.ok) {
    if (res.error !== 'cancelled') window.alert(`Save failed: ${res.error}`);
    return undefined;
  }
  return res.filename;
}
