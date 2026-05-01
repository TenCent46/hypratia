import { ArtifactService } from './ArtifactService';
import { ClaudeCodeExecutionArtifactProvider } from './providers/ClaudeCodeExecutionArtifactProvider';
import { OpenAIAudioArtifactProvider } from './providers/OpenAIAudioArtifactProvider';
import { OpenAICodeInterpreterArtifactProvider } from './providers/OpenAICodeInterpreterArtifactProvider';
import { OpenAIVideoArtifactProvider } from './providers/OpenAIVideoArtifactProvider';

export type {
  ArtifactKind,
  ArtifactProviderId,
  ArtifactRequest,
  ArtifactResult,
  ArtifactResultOk,
  ArtifactResultErr,
  ArtifactUsageRecord,
  AudioFormat,
  DocumentFormat,
  ProviderUsage,
} from './types';

export {
  documentFormatMeta,
  audioMime,
  extensionForLanguageHint,
  extensionFromFilename,
  isTextSafeExtension,
  normalizeFilename,
} from './filenames';

export const artifacts = new ArtifactService({
  claudeDocument: new ClaudeCodeExecutionArtifactProvider(),
  openaiDocument: new OpenAICodeInterpreterArtifactProvider(),
  openaiAudio: new OpenAIAudioArtifactProvider(),
  openaiVideo: new OpenAIVideoArtifactProvider(),
});

export {
  ArtifactService,
  drainPendingArtifacts,
  type ArtifactProgressDetail,
} from './ArtifactService';
