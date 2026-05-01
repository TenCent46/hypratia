import type { Attachment } from '../../types';

export type IngestSource =
  (
    | { kind: 'path'; path: string; suggestedName?: string }
    | {
        kind: 'bytes';
        bytes: Uint8Array;
        suggestedName: string;
        mimeType: string;
      }
  ) & { conversationId?: string };

export interface AttachmentService {
  ingest(source: IngestSource): Promise<Attachment>;
  removeByAttachment(att: Attachment): Promise<void>;
  toUrl(att: Attachment): Promise<string>;
  resolveAbsolutePath(att: Attachment): Promise<string>;
  readBytes(att: Attachment): Promise<Uint8Array>;
}
