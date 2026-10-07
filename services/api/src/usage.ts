import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { UsagePeriod, UsageSummary } from '@calc/shared';

import type { ModelCall } from './grader';
import { estimateCost, type TokenUsage } from './pricing';

export type UsageKind = 'grade' | 'tutor';

/** One Claude response (retries and failed requests included): what it cost. */
type CallRecord = {
  type: 'call';
  t: number;
  kind: UsageKind;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write: number;
  cache_read: number;
  cost_usd: number;
};

/** One request from the app and how it ended. */
type RequestRecord = { type: 'request'; t: number; kind: UsageKind; ok: boolean; cached?: boolean; code?: string };

type UsageRecord = CallRecord | RequestRecord;

/**
 * Spending log. Each record is a line of JSON appended to `file` (token counts,
 * costs and outcomes only: never images or page content), so totals survive
 * restarts. Pass null to keep it in memory (tests). Days and months follow the
 * server's local time zone.
 */
export class UsageLog {
  private records: UsageRecord[] = [];

  constructor(
    private readonly file: string | null,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          this.records.push(JSON.parse(line) as UsageRecord);
        } catch {
          // Skip a torn last line from a crash mid-write.
        }
      }
    }
  }

  recordCall(kind: UsageKind, model: string, usage: TokenUsage): void {
    this.append({
      type: 'call',
      t: this.now().getTime(),
      kind,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_write: usage.cache_creation_input_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cost_usd: estimateCost(model, usage),
    });
  }

  recordRequest(kind: UsageKind, outcome: { ok: boolean; cached?: boolean; code?: string }): void {
    this.append({ type: 'request', t: this.now().getTime(), kind, ...outcome });
  }

  /** Spent so far this calendar month. */
  monthCost(): number {
    const start = monthStart(this.now());
    return this.records.reduce((sum, r) => (r.type === 'call' && r.t >= start ? sum + r.cost_usd : sum), 0);
  }

  summary(monthlyBudget: number): UsageSummary {
    const now = this.now();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const month = this.period(monthStart(now));
    return {
      today: this.period(dayStart),
      month,
      all_time: this.period(0),
      avg_page_cost_usd: month.pages > 0 ? round(this.gradeCost(monthStart(now)) / month.pages) : null,
      monthly_budget_usd: monthlyBudget > 0 ? monthlyBudget : null,
      month_label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  private period(since: number): UsagePeriod {
    let pages = 0;
    let tutor = 0;
    let failed = 0;
    let cost = 0;
    for (const r of this.records) {
      if (r.t < since) continue;
      if (r.type === 'call') cost += r.cost_usd;
      else if (!r.ok) failed++;
      else if (r.kind === 'grade') pages++;
      else tutor++;
    }
    return { pages, tutor, failed, cost_usd: round(cost) };
  }

  private gradeCost(since: number): number {
    return this.records.reduce((sum, r) => (r.type === 'call' && r.kind === 'grade' && r.t >= since ? sum + r.cost_usd : sum), 0);
  }

  private append(record: UsageRecord): void {
    this.records.push(record);
    if (!this.file) return;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify(record) + '\n');
    } catch (error) {
      console.error('Could not write the usage log:', error instanceof Error ? error.message : error);
    }
  }
}

/** Wraps a model call so every response's tokens and cost are logged. */
export function withUsage(call: ModelCall, log: UsageLog, kind: UsageKind): ModelCall {
  return async (params, onText) => {
    const response = await call(params, onText);
    log.recordCall(kind, response.model, response.usage);
    return response;
  };
}

function monthStart(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function round(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}
