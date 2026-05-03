import { useMemo } from 'react';
import { useStore } from '../../store';
import {
  DEFAULT_BUDGETS,
  monthToDate,
} from '../../services/cost/CostTracker';

/**
 * Plan 49 — header badge showing month-to-date LLM spend across L2 + L3.
 * Quiet when zero (greyed, no number); colored when within budget; red when
 * a tier is over its cap. Click → opens the cost details modal (todo).
 */
export function CostBadge() {
  const records = useStore((s) => s.settings.costRecords ?? []);
  const budgets = useStore((s) => s.settings.budgets ?? DEFAULT_BUDGETS);

  const { mtd, total, over } = useMemo(() => {
    const m = monthToDate(records);
    const overL2 = budgets.L2 > 0 && m.L2 > budgets.L2;
    const overL3 = budgets.L3 > 0 && m.L3 > budgets.L3;
    return { mtd: m, total: m.L2 + m.L3, over: overL2 || overL3 };
  }, [records, budgets]);

  const isQuiet = total === 0;

  return (
    <button
      type="button"
      className={`cost-badge${isQuiet ? ' is-quiet' : ''}${over ? ' is-over' : ''}`}
      title={`L2: $${mtd.L2.toFixed(2)} of $${budgets.L2.toFixed(0)} · L3: $${mtd.L3.toFixed(2)} of $${budgets.L3.toFixed(0)}`}
      aria-label={`Month-to-date LLM spend: $${total.toFixed(2)}`}
    >
      <span className="cost-badge-dot" aria-hidden />
      {isQuiet ? '$0' : `$${total.toFixed(2)}`}
    </button>
  );
}
