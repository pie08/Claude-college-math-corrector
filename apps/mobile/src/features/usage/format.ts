import type { UsagePeriod, UsageSummary } from '@calc/shared';

export function formatDollars(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

/** "3 pages · 1 solution · $0.12" */
export function describePeriod(p: UsagePeriod): string {
  const parts = [`${p.pages} ${p.pages === 1 ? 'page' : 'pages'}`];
  if (p.tutor > 0) parts.push(`${p.tutor} ${p.tutor === 1 ? 'solution' : 'solutions'}`);
  parts.push(formatDollars(p.cost_usd));
  return parts.join(' · ');
}

export type BudgetState = { fraction: number; label: string; level: 'ok' | 'near' | 'over' } | null;

/** How much of the monthly budget is used; "near" from 80%. Null without a budget. */
export function budgetState(summary: UsageSummary): BudgetState {
  const budget = summary.monthly_budget_usd;
  if (!budget) return null;
  const spent = summary.month.cost_usd;
  const fraction = Math.min(1, spent / budget);
  const level = spent >= budget ? 'over' : fraction >= 0.8 ? 'near' : 'ok';
  return { fraction, level, label: `${formatDollars(spent)} of ${formatDollars(budget)}` };
}
