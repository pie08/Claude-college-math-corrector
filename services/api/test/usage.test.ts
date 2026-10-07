import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { UsageSummarySchema } from '@calc/shared';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp, ResultCache } from '../src/app';
import type { ServerConfig } from '../src/config';
import { estimateCost } from '../src/pricing';
import { UsageLog } from '../src/usage';
import { config as graderConfig, fakeCall, reply, sampleGrade } from './helpers';

const dir = mkdtempSync(path.join(tmpdir(), 'usage-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const usage = { input_tokens: 3000, output_tokens: 2000 };

describe('estimateCost', () => {
  it('prices cache writes at 1.25x and reads at 0.1x of input', () => {
    expect(estimateCost('claude-sonnet-5-5', usage)).toBeCloseTo(0.026, 5);
    expect(estimateCost('claude-sonnet-5-5', { ...usage, cache_creation_input_tokens: 1000 })).toBeCloseTo(0.0285, 5);
    expect(estimateCost('claude-sonnet-5-5', { ...usage, cache_read_input_tokens: 1000 })).toBeCloseTo(0.0262, 5);
  });
});

describe('UsageLog', () => {
  it('sums calls and requests by day, month and all time', () => {
    let now = new Date(2026, 9, 6, 12);
    const log = new UsageLog(null, () => now);
    log.recordCall('grade', 'claude-sonnet-5-5', usage);
    log.recordRequest('grade', { ok: true });
    log.recordCall('tutor', 'claude-sonnet-5-5', usage);
    log.recordRequest('tutor', { ok: true });
    log.recordRequest('grade', { ok: false, code: 'grading_failed' });
    now = new Date(2026, 9, 7, 9);
    log.recordCall('grade', 'claude-sonnet-5-5', usage);
    log.recordRequest('grade', { ok: true });

    const s = UsageSummarySchema.parse(log.summary(10));
    expect(s.today).toEqual({ pages: 1, tutor: 0, failed: 0, cost_usd: 0.026 });
    expect(s.month).toEqual({ pages: 2, tutor: 1, failed: 1, cost_usd: 0.078 });
    expect(s.avg_page_cost_usd).toBe(0.026);
    expect(s.monthly_budget_usd).toBe(10);
    expect(s.month_label).toBe('2026-10');

    now = new Date(2026, 10, 1, 9);
    expect(log.summary(0).month.cost_usd).toBe(0);
    expect(log.summary(0).all_time.pages).toBe(2);
    expect(log.summary(0).monthly_budget_usd).toBeNull();
  });

  it('persists to its file and reloads', () => {
    const file = path.join(dir, 'nested', 'usage.jsonl');
    new UsageLog(file).recordCall('grade', 'claude-sonnet-5-5', usage);
    expect(readFileSync(file, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
    expect(new UsageLog(file).monthCost()).toBeCloseTo(0.026, 5);
  });
});

describe('ResultCache', () => {
  it('expires entries and evicts the oldest', () => {
    let now = 0;
    const cache = new ResultCache<number>(2, 1000, () => now);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    now = 2000;
    expect(cache.get('c')).toBeUndefined();
  });
});

describe('grading with usage tracking', () => {
  const config: ServerConfig = {
    ...graderConfig, port: 0, sharedSecret: 's', tutorEffort: 'medium', dailyLimit: 10, maxUploadBytes: 5_000_000,
    monthlyBudget: 0, usageLogPath: '',
  };

  async function upload() {
    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#fff' } })
      .composite([{ input: { create: { width: 400, height: 8, channels: 3, background: '#111' } }, top: 300, left: 200 }])
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'page.jpg');
    return new Request('http://test/v1/grade', { method: 'POST', headers: { authorization: 'Bearer s' }, body: form });
  }

  it('logs the cost, answers the same photo from memory, and reports usage', async () => {
    const log = new UsageLog(null);
    const { call, requests } = fakeCall([reply(JSON.stringify(sampleGrade()))]);
    const app = createApp(config, { call, usage: log });
    expect((await app.request(await upload())).status).toBe(200);
    expect((await app.request(await upload())).status).toBe(200);
    expect(requests).toHaveLength(1); // second one came from the cache

    const res = await app.request(new Request('http://test/v1/usage', { headers: { authorization: 'Bearer s' } }));
    const summary = UsageSummarySchema.parse(await res.json());
    expect(summary.today.pages).toBe(2);
    expect(summary.today.cost_usd).toBeCloseTo(0.026, 5);
  });

  it('refuses new work once the monthly budget is used up', async () => {
    const log = new UsageLog(null);
    log.recordCall('grade', 'claude-sonnet-5-5', usage);
    const { call } = fakeCall([]);
    const app = createApp({ ...config, monthlyBudget: 0.01 }, { call, usage: log });
    const res = await app.request(await upload());
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'over_budget' } });
  });

  it('requires the secret for usage', async () => {
    const app = createApp(config, { call: fakeCall([]).call });
    expect((await app.request(new Request('http://test/v1/usage'))).status).toBe(401);
  });
});
