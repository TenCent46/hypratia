import type { CanvasNode, ID } from '../../types';
import { suggestRelated, type Suggestion } from './HeuristicSimilarity';
// TODO: when an EmbeddingProvider is real (ONNX / WebGPU / transformers.js),
// add an EmbeddingSimilarity strategy that uses node.embedding cosine ranking.

export type SimilarityStrategy = 'heuristic' | 'embedding';

class SimilarityService {
  private strategy: SimilarityStrategy = 'heuristic';

  setStrategy(s: SimilarityStrategy): void {
    this.strategy = s;
  }

  related(nodeId: ID, allNodes: CanvasNode[]): Suggestion[] {
    switch (this.strategy) {
      case 'embedding':
        // TODO: implement when embeddings are real. Falls back to heuristic.
        return suggestRelated(nodeId, allNodes);
      case 'heuristic':
      default:
        return suggestRelated(nodeId, allNodes);
    }
  }
}

export const similarityService = new SimilarityService();
export type { Suggestion } from './HeuristicSimilarity';
