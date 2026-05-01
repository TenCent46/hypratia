import { secrets, SECRET_KEY } from '../../secrets';
import { useStore } from '../../../store';
import { audioMime } from '../filenames';
import type {
  ArtifactProvider,
  AudioFormat,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from '../types';

const OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'coral';

/**
 * Voices accepted by OpenAI TTS at the time of writing. Kept here as a soft
 * allowlist so unknown voices fail clearly instead of returning an opaque
 * 400 from the provider. Update as OpenAI ships new voices.
 */
const KNOWN_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
]);

type AudioPayload = {
  text: string;
  voice?: string;
  instructions?: string;
  format?: AudioFormat;
};

function parsePayload(raw: string): AudioPayload {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioPayload>;
    if (typeof parsed.text === 'string') return parsed as AudioPayload;
  } catch {
    // fall through
  }
  return { text: raw };
}

export class OpenAIAudioArtifactProvider implements ArtifactProvider {
  readonly id = 'openai-audio' as const;

  async isAvailable(): Promise<boolean> {
    const key = await secrets.get(SECRET_KEY('openai'));
    return Boolean(key && key.length > 0);
  }

  async generate(
    input: ProviderGenerateInput,
  ): Promise<ProviderGenerateOutput> {
    const apiKey = await secrets.get(SECRET_KEY('openai'));
    if (!apiKey) throw new Error('missing-openai-key');

    const settings = useStore.getState().settings;
    const payload = parsePayload(input.prompt);
    const format = (payload.format ??
      settings.artifacts?.ttsFormat ??
      'mp3') as AudioFormat;
    const voice =
      payload.voice ?? settings.artifacts?.ttsVoice ?? DEFAULT_VOICE;
    if (!KNOWN_VOICES.has(voice)) {
      throw new Error(
        `unknown-voice: "${voice}" is not in the known TTS voice list (${[...KNOWN_VOICES].join(', ')})`,
      );
    }
    if (!payload.text || payload.text.trim().length === 0) {
      throw new Error('empty-text');
    }

    const body: Record<string, unknown> = {
      model: DEFAULT_MODEL,
      input: payload.text,
      voice,
      response_format: format,
    };
    if (payload.instructions) body.instructions = payload.instructions;

    const res = await fetch(`${OPENAI_BASE}/audio/speech`, {
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
      throw new Error(`openai-tts ${res.status}: ${text.slice(0, 400)}`);
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength === 0) throw new Error('empty-audio');
    return {
      bytes,
      mimeType: audioMime(format),
      filename: input.filename,
      usage: { characters: payload.text.length },
    };
  }
}
