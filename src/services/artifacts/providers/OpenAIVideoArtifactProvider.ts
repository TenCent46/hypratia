// ⚠ The OpenAI Videos API and Sora 2 are scheduled for deprecation in 2026.
// This adapter is intentionally optional, gated by `settings.artifacts.videoEnabled`.
// Do not rely on this as a core feature.

import { secrets, SECRET_KEY } from '../../secrets';
import type {
  ArtifactProvider,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from '../types';

const OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'sora-2';
const DEFAULT_SECONDS = 4;
const DEFAULT_SIZE = '720x1280';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Soft allowlist of `size` values accepted by Sora 2 / 2-Pro at the time
 * of writing. Acts as an early-fail check so users get a readable error
 * instead of an opaque 400 from the provider. Update as OpenAI adjusts
 * supported resolutions; the deprecation timeline (2026) means we are
 * not investing in a richer validator.
 */
const KNOWN_SIZES = new Set([
  '720x1280',
  '1280x720',
  '1024x1792',
  '1792x1024',
  '1024x1024',
]);

/**
 * Allowlist of model identifiers we recognize. Other strings are rejected
 * so a typo doesn't quietly run on a model the user did not intend.
 */
const KNOWN_MODELS = new Set(['sora-2', 'sora-2-pro']);

type VideoPayload = {
  prompt: string;
  seconds?: number;
  size?: string;
  model?: string;
};

function parsePayload(raw: string): VideoPayload {
  try {
    const parsed = JSON.parse(raw) as Partial<VideoPayload>;
    if (typeof parsed.prompt === 'string') return parsed as VideoPayload;
  } catch {
    // fall through
  }
  return { prompt: raw };
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new Error('aborted'));
    });
  });
}

export class OpenAIVideoArtifactProvider implements ArtifactProvider {
  readonly id = 'openai-video' as const;

  async isAvailable(): Promise<boolean> {
    const key = await secrets.get(SECRET_KEY('openai'));
    return Boolean(key && key.length > 0);
  }

  async generate(
    input: ProviderGenerateInput,
  ): Promise<ProviderGenerateOutput> {
    const apiKey = await secrets.get(SECRET_KEY('openai'));
    if (!apiKey) throw new Error('missing-openai-key');

    const payload = parsePayload(input.prompt);
    const model = payload.model ?? DEFAULT_MODEL;
    const size = payload.size ?? DEFAULT_SIZE;
    const seconds = payload.seconds ?? DEFAULT_SECONDS;
    if (!KNOWN_MODELS.has(model)) {
      throw new Error(
        `unknown-model: "${model}" is not a recognized Sora model (${[...KNOWN_MODELS].join(', ')})`,
      );
    }
    if (!KNOWN_SIZES.has(size)) {
      throw new Error(
        `unknown-size: "${size}" is not in the known Sora size list (${[...KNOWN_SIZES].join(', ')})`,
      );
    }
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 20) {
      throw new Error(`invalid-seconds: ${seconds} (must be 1-20)`);
    }
    const body = { model, prompt: payload.prompt, seconds, size };

    const create = await fetch(`${OPENAI_BASE}/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
    if (!create.ok) {
      const text = await create.text();
      throw new Error(`openai-video-create ${create.status}: ${text.slice(0, 300)}`);
    }
    const job = (await create.json()) as { id?: string; status?: string };
    if (!job.id) throw new Error('openai-video-create: no job id returned');

    const finalStatus = await this.poll(apiKey, job.id, input.signal);
    if (finalStatus !== 'completed') {
      throw new Error(`openai-video: final status ${finalStatus}`);
    }
    const bytes = await this.download(apiKey, job.id, input.signal);
    if (bytes.byteLength === 0) throw new Error('empty-video');
    return {
      bytes,
      mimeType: 'video/mp4',
      filename: input.filename,
      usage: { seconds },
    };
  }

  private async poll(
    apiKey: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('aborted');
      const res = await fetch(`${OPENAI_BASE}/videos/${jobId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`openai-video-poll ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as { status?: string; error?: unknown };
      const status = json.status ?? 'unknown';
      if (status === 'completed') return status;
      if (status === 'failed' || status === 'cancelled') {
        throw new Error(
          `openai-video-poll: ${status} ${JSON.stringify(json.error ?? {}).slice(0, 200)}`,
        );
      }
      await sleep(POLL_INTERVAL_MS, signal);
    }
    throw new Error('openai-video-poll: timeout');
  }

  private async download(
    apiKey: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const res = await fetch(`${OPENAI_BASE}/videos/${jobId}/content`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openai-video-download ${res.status}: ${text.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}
