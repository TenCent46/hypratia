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
  ) & {
    conversationId?: string;
    /**
     * Wait for the Knowledge Base `raw/` mirror copy before resolving.
     * Normal chat/file-drop ingestion can mirror in the background, but
     * the workspace Files tab needs the copy to exist before it refreshes.
     */
    awaitRawMirror?: boolean;
    /**
     * Force the `raw/` mirror even when unprojected chat mirroring is disabled.
     * Used by explicit workspace Files-tab imports.
     */
    forceRawMirror?: boolean;
  };

export interface AttachmentService {
  ingest(source: IngestSource): Promise<Attachment>;
  removeByAttachment(att: Attachment): Promise<void>;
  toUrl(att: Attachment): Promise<string>;
  resolveAbsolutePath(att: Attachment): Promise<string>;
  readBytes(att: Attachment): Promise<Uint8Array>;
}
