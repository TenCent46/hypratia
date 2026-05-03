/**
 * Shared types between Hypratia and the Obsidian companion plugin.
 * Mirrors the shapes Hypratia writes to the vault under `Hypratia/`.
 */

export type IndexEntry = {
  id: string;
  title: string;
  /** Vault-relative path to the canvas file. */
  canvasFile: string;
};

export type IndexFile = {
  version: number;
  syncedAt: string;
  canvases: IndexEntry[];
};

/** Per-canvas geometry sidecar (`{name}.hypratia.json`). Optional. */
export type GeometrySidecar = {
  version: number;
  generatedAt: string;
  positions: Record<string, { x: number; y: number; width: number; height: number }>;
};

/** Mailbox payload — the plugin writes one of these to
 *  `Hypratia/.mailbox/incoming/{nano}.json` and Hypratia consumes it. */
export type MailboxPayload =
  | {
      kind: 'send-selection';
      sentAt: string;
      sourceFile: string;
      text: string;
      title?: string;
    }
  | {
      kind: 'send-file';
      sentAt: string;
      sourceFile: string;
      title: string;
      content: string;
    };

export type JsonCanvasNode = {
  id: string;
  type: 'text' | 'file' | 'group' | 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
};

export type JsonCanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
  toEnd?: 'arrow' | 'none';
};

export type JsonCanvas = {
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
};
