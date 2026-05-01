import { secrets, SECRET_KEY } from '../../secrets';
import { useStore } from '../../../store';
import type {
  ArtifactProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from '../types';

const OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.5';

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

type FileRef = { container_id: string; file_id: string; filename?: string };

function pickModel(): string {
  const def = useStore.getState().settings.defaultModel;
  if (def?.provider === 'openai') return def.model;
  return DEFAULT_MODEL;
}

function collectAnnotations(node: unknown, out: FileRef[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectAnnotations(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (
    obj.type === 'container_file_citation' &&
    typeof obj.container_id === 'string' &&
    typeof obj.file_id === 'string'
  ) {
    out.push({
      container_id: obj.container_id,
      file_id: obj.file_id,
      filename:
        typeof obj.filename === 'string' ? obj.filename : undefined,
    });
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectAnnotations(value, out);
  }
}

function dedupe(refs: FileRef[]): FileRef[] {
  const seen = new Set<string>();
  const out: FileRef[] = [];
  for (const r of refs) {
    const key = `${r.container_id}/${r.file_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export class OpenAICodeInterpreterArtifactProvider implements ArtifactProvider {
  readonly id = 'openai-code-interpreter' as const;

  async isAvailable(): Promise<boolean> {
    const key = await secrets.get(SECRET_KEY('openai'));
    return Boolean(key && key.length > 0);
  }

  async generate(
    input: ProviderGenerateInput,
  ): Promise<ProviderGenerateOutput> {
    const apiKey = await secrets.get(SECRET_KEY('openai'));
    if (!apiKey) throw new Error('missing-openai-key');

    const format = input.format.toLowerCase();
    const hint = FORMAT_HINTS[format] ?? '';
    const instruction = [
      `Create a ${format.toUpperCase()} file based on this brief:`,
      '',
      input.prompt,
      '',
      `Use the code interpreter tool to generate it. ${hint}.`,
      `Save the final file as exactly "${input.filename}".`,
      'Do not return the file contents inline; the host will retrieve the file from the container.',
    ].join('\n');

    const body = {
      model: pickModel(),
      input: instruction,
      tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
    };

    const res = await fetch(`${OPENAI_BASE}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openai ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      usage?: { input_tokens?: number; output_tokens?: number };
    } & unknown;
    const refs: FileRef[] = [];
    collectAnnotations(json, refs);
    const unique = dedupe(refs);
    if (unique.length === 0) {
      throw new Error(
        'no-file-generated: OpenAI code interpreter did not annotate a file',
      );
    }
    const target =
      unique.find((r) => r.filename?.toLowerCase().endsWith(`.${format}`)) ??
      unique[0];
    const bytes = await this.download(
      apiKey,
      target.container_id,
      target.file_id,
      input.signal,
    );
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

  private async download(
    apiKey: string,
    containerId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const url = `${OPENAI_BASE}/containers/${containerId}/files/${fileId}/content`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openai-container ${res.status}: ${text.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}
