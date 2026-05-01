import { AiSdkChatProvider } from './AiSdkChatProvider';
import type { ChatProvider } from './ChatProvider';

export const chat: ChatProvider = new AiSdkChatProvider();
export type {
  ChatChunk,
  ChatFilePart,
  ChatImagePart,
  ChatMessage,
  ChatPart,
  ChatProvider,
  ChatRequest,
  ChatResult,
  ChatRole,
  ChatTextPart,
  ListModelsResult,
  ReasoningEffort,
  TestKeyResult,
} from './ChatProvider';
export {
  PROVIDERS,
  PROVIDER_ORDER,
  getModelMeta,
  modelLabel,
  type ModelCapability,
  type ModelMeta,
  type ProviderMeta,
} from './providers';
