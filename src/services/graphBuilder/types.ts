import type {
  CanvasNode,
  Edge,
  ID,
  ModelRef,
  ThemeKind,
} from '../../types';

export type GraphInputKind = 'conversation' | 'prose';

export type BuildSummary = {
  classifiedAs: GraphInputKind;
  nodeCount: number;
  edgeCount: number;
  /** The first chain tier that produced output, or `'heuristic'` if none did. */
  modelUsed: ModelRef | 'heuristic';
  durationMs: number;
};

export type ChainTier = ModelRef | 'heuristic';

export type GraphBuildOptions = {
  /** Conversation to attach the new nodes to; created if missing. */
  conversationId: ID;
  /** Top-level signal for cancellation. */
  signal?: AbortSignal;
  /** Override for the model chain. When unset the chain is auto-built. */
  chainOverride?: ChainTier[];
};

export type StagedNode = Omit<CanvasNode, 'id' | 'createdAt' | 'updatedAt'>;
export type StagedEdge = Omit<Edge, 'id' | 'createdAt'>;

export type StagedGraph = {
  nodes: StagedNode[];
  edges: Array<{
    /** Index into `nodes`; resolved to real ids after the batch insert. */
    sourceIndex: number;
    targetIndex: number;
    kind?: 'parent' | 'related';
    label?: string;
  }>;
};

export type ConversationTurn = {
  index: number;
  role: 'user' | 'assistant';
  content: string;
};

export type ConversationClassification = {
  index: number;
  themeId: string | null;
  isNew: boolean;
  themeTitle: string;
  askSummary: string;
  themeKind: ThemeKind;
  importance: 1 | 2 | 3 | 4 | 5;
};

export type ProseConcept = {
  id: string;
  title: string;
  summary: string;
  importance: 1 | 2 | 3 | 4 | 5;
};

export type ProseEdge = {
  source: string;
  target: string;
  label?: string;
};
