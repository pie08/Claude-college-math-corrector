import { z } from 'zod';

/** Spending as reported by `GET /v1/usage`. Costs are estimates in USD. */
export const UsagePeriodSchema = z.object({
  /** Pages graded successfully (identical photos answered from memory count, at no cost). */
  pages: z.number(),
  /** Step-by-step solutions worked out. */
  tutor: z.number(),
  /** Requests that failed (they may still have cost something). */
  failed: z.number(),
  cost_usd: z.number(),
});

export const UsageSummarySchema = z.object({
  today: UsagePeriodSchema,
  month: UsagePeriodSchema,
  all_time: UsagePeriodSchema,
  /** Average cost of a graded page this month; null with no pages yet. */
  avg_page_cost_usd: z.number().nullable(),
  /** Monthly budget from the server's MONTHLY_BUDGET_USD; null when there is none. */
  monthly_budget_usd: z.number().nullable(),
  /** UTC month the "month" figures cover, e.g. "2026-10". */
  month_label: z.string(),
});

export type UsagePeriod = z.infer<typeof UsagePeriodSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
