import { secrets, SECRET_KEY } from '../secrets';
import {
  HeuristicClassifier,
  LLMClassifier,
  type Classifier,
} from './Classifier';
import type { ModelRef, Settings } from '../../types';

export type {
  ClassifyInput,
  ClassifyOutput,
  Classifier,
} from './Classifier';
export { HeuristicClassifier, LLMClassifier } from './Classifier';

/**
 * Pick a classifier honoring `settings.themesClassifier`. The `auto` mode
 * uses the LLM when the active provider has a key configured; otherwise it
 * falls back to the offline heuristic.
 */
export async function pickClassifier(
  settings: Settings,
  model: ModelRef | undefined,
): Promise<Classifier> {
  const choice = settings.themesClassifier ?? 'auto';
  if (choice === 'heuristic') return new HeuristicClassifier();
  if (choice === 'llm') {
    if (!model) return new HeuristicClassifier();
    return new LLMClassifier(model);
  }
  // auto
  if (!model) return new HeuristicClassifier();
  const hasKey = await secrets
    .get(SECRET_KEY(model.provider))
    .then((k) => Boolean(k));
  return hasKey ? new LLMClassifier(model) : new HeuristicClassifier();
}
