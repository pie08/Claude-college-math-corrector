import type { UsageSummary } from '@calc/shared';
import { describe, expect, it } from '@jest/globals';

import { budgetState, describePeriod, formatDollars } from '../format';

const period = { pages: 3, tutor: 1, failed: 0, cost_usd: 0.1234 };
const summary = (cost: number, budget: number | null): UsageSummary => ({
  today: period,
  month: { ...period, cost_usd: cost },
  all_time: period,
  avg_page_cost_usd: 0.034,
  monthly_budget_usd: budget,
  month_label: '2026-10',
});

describe('usage formatting', () => {
  it('formats dollars, including tiny amounts', () => {
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(0.004)).toBe('<$0.01');
    expect(formatDollars(1.239)).toBe('$1.24');
  });

  it('describes a period', () => {
    expect(describePeriod(period)).toBe('3 pages · 1 solution · $0.12');
    expect(describePeriod({ pages: 1, tutor: 0, failed: 0, cost_usd: 0.03 })).toBe('1 page · $0.03');
  });

  it('reports budget levels', () => {
    expect(budgetState(summary(1, null))).toBeNull();
    expect(budgetState(summary(1, 10))).toMatchObject({ level: 'ok', label: '$1.00 of $10.00' });
    expect(budgetState(summary(8.5, 10))?.level).toBe('near');
    expect(budgetState(summary(12, 10))).toMatchObject({ level: 'over', fraction: 1 });
  });
});
