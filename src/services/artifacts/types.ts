import type { ID } from '../../types';

export type ArtifactKind = 'text' | 'document' | 'audio' | 'video';

export type ArtifactProviderId =
  | 'host-text'
  | 'claude-code-execution'
  | 'openai-code-interpreter'
  | 'openai-audio'
  | 'openai-video';

export type DocumentFormat = 'docx' | 'pptx' | 'xlsx' | 'pdf';
export type AudioFormat = 'mp3' | 'wav' | 'opus' | 'aac' | 'flac';

export type ArtifactRequest = {
  conversationId: ID;
  sourceMessageId?: ID;
  title?: string;
  filename: string;
  saveToKnowledgeBase?: boolean;
  createCanvasNode?: boolean;
} & (
  | {
      kind: 'text';
      textContent: string;
      language?: string;
      mimeType?: string;
    }
  | {
      kind: 'document';
      prompt: string;
      format: DocumentFormat;
      providerHint?: 'claude' | 'openai';
    }
  | {
      kind: 'audio';
      text: string;
      voice?: string;
      instructions?: string;
      format?: AudioFormat;
    }
  | {
      kind: 'video';
      prompt: string;
      seconds?: number;
      size?: string;
    }
);

export type ArtifactResultOk = {
  ok: true;
  artifactId: ID;
  filename: string;
  extension: string;
  mimeType: string;
  attachmentId: ID;
  nodeId?: ID;
  knowledgeBasePath?: string;
  provider: ArtifactProviderId;
  sizeBytes: number;
  sourceConversationId: ID;
  sourceMessageId?: ID;
  createdAt: string;
};

export type ArtifactResultErr = {
  ok: false;
  error: string;
  provider?: ArtifactProviderId;
};

export type ArtifactResult = ArtifactResultOk | ArtifactResultErr;

export type ProviderGenerateInput = {
  prompt: string;
  filename: string;
  format: string;
  signal?: AbortSignal;
};

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  /** Character count for TTS-style requests (no token concept). */
  characters?: number;
  /** Seconds requested for video generation. */
  seconds?: number;
};

export type ProviderGenerateOutput = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  usage?: ProviderUsage;
};

export type ArtifactUsageRecord = {
  artifactId: string;
  conversationId: string;
  provider: ArtifactProviderId;
  kind: ArtifactKind;
  format?: string;
  filename: string;
  sizeBytes: number;
  usage?: ProviderUsage;
  createdAt: string;
};

export interface ArtifactProvider {
  readonly id: ArtifactProviderId;
  isAvailable(): Promise<boolean>;
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput>;
}
