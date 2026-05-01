import type { AttachmentService } from './AttachmentService';
import { TauriAttachmentService } from './TauriAttachmentService';

export const attachments: AttachmentService = new TauriAttachmentService();
export type { AttachmentService, IngestSource } from './AttachmentService';
