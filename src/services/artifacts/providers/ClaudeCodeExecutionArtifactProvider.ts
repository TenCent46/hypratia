import { secrets, SECRET_KEY } from '../../secrets';
import { useStore } from '../../../store';
import type {
  ArtifactProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from '../types';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const SUPPORTED_MODELS = new Set<string>([
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-7',
  'claude-opus-4-7-1m',
]);
const DEFAULT_MODEL = 'claude-sonnet-4-5';

const FORMAT_HINTS: Record<string, string> = {
  docx: 'use python-docx',
  pptx: 'use python-pptx',
  xlsx: 'use openpyxl or xlsxwriter',
  pdf: 'use reportlab',
};

const FORMAT_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function pickModel(): string {
  const def = useStore.getState().settings.defaultModel;
  if (def?.provider === 'anthropic' && SUPPORTED_MODELS.has(def.model)) {
    return def.model;
  }
  return DEFAULT_MODEL;
}

function authHeaders(apiKey: string, betas: string[]): HeadersInit {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': betas.join(','),
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
}

type FileRef = { file_id: string; filename?: string };

function collectFileRefs(node: unknown, out: FileRef[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectFileRefs(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type : undefined;
  const fileId =
    typeof obj.file_id === 'string'
      ? obj.file_id
      : typeof (obj as { fileId?: unknown }).fileId === 'string'
        ? ((obj as { fileId: string }).fileId)
        : undefined;
  if (
    fileId &&
    (type === 'code_execution_output' ||
      type === 'code_execution_result' ||
      type === undefined)
  ) {
    const filename =
      typeof obj.filename === 'string' ? obj.filename : undefined;
    out.push({ file_id: fileId, filename });
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectFileRefs(value, out);
  }
}

function dedupeRefs(refs: FileRef[]): FileRef[] {
  const seen = new Set<string>();
  const out: FileRef[] = [];
  for (const r of refs) {
    if (seen.has(r.file_id)) continue;
    seen.add(r.file_id);
    out.push(r);
  }
  return out;
}

export class ClaudeCodeExecutionArtifactProvider implements ArtifactProvider {
  readonly id = 'claude-code-execution' as const;

  async isAvailable(): Promise<boolean> {
    const key = await secrets.get(SECRET_KEY('anthropic'));
    return Boolean(key && key.length > 0);
  }

  async generate(
    input: ProviderGenerateInput,
  ): Promise<ProviderGenerateOutput> {
    const apiKey = await secrets.get(SECRET_KEY('anthropic'));
    if (!apiKey) throw new Error('missing-anthropic-key');

    const model = pickModel();
    const format = input.format.toLowerCase();
    const hint = FORMAT_HINTS[format] ?? '';
    const userMessage = [
      `Create a ${format.toUpperCase()} file based on this brief:`,
      '',
      input.prompt,
      '',
      `Use the code execution tool to generate it. ${hint}.`,
      `Save the final file as exactly "${input.filename}".`,
      'Do not return the file contents inline; the host will retrieve the file via the Files API.',
    ].join('\n');

    const body = {
      model,
      max_tokens: 8192,
      tools: [
        { type: 'code_execution_20250825', name: 'code_execution' },
      ],
      messages: [{ role: 'user', content: userMessage }],
    };

    const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: authHeaders(apiKey, [
        'code-execution-2025-08-25',
        'files-api-2025-04-14',
      ]),
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`anthropic ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      usage?: { input_tokens?: number; output_tokens?: number };
    } & unknown;
    const refs: FileRef[] = [];
    collectFileRefs(json, refs);
    const unique = dedupeRefs(refs);
    if (unique.length === 0) {
      throw new Error(
        'no-file-generated: Claude did not produce a file via code execution',
      );
    }

    const target =
      unique.find((r) => r.filename?.toLowerCase().endsWith(`.${format}`)) ??
      unique[0];
    const bytes = await this.downloadFile(apiKey, target.file_id, input.signal);
    if (bytes.byteLength === 0) throw new Error('empty-file');
    const usage = (json as { usage?: { input_tokens?: number; output_tokens?: number } })
      .usage;
    return {
      bytes,
      mimeType: FORMAT_MIME[format] ?? 'application/octet-stream',
      filename: target.filename ?? input.filename,
      usage: usage
        ? {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
          }
        : undefined,
    };
  }

  private async downloadFile(
    apiKey: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const res = await fetch(`${ANTHROPIC_BASE}/files/${fileId}/content`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`anthropic-files ${res.status}: ${text.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}
