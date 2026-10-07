import { createHash } from 'node:crypto';

import { TutorContextSchema, type GradeErrorCode, type GradeEvent, type GradeResult, type TutorResult } from '@calc/shared';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { Checker } from './cas';
import type { ServerConfig } from './config';
import { gradePage, GradeError, type ModelCall, type Progress } from './grader';
import { BadImageError, prepareImage } from './image';
import { solveProblem } from './tutor';
import { UsageLog, withUsage, type UsageKind } from './usage';

const STATUS: Record<GradeErrorCode, 400 | 401 | 413 | 422 | 429 | 500 | 502> = {
  unauthorized: 401,
  rate_limited: 429,
  over_budget: 429,
  bad_request: 400,
  bad_image: 422,
  too_blurry: 422,
  model_refused: 422,
  grading_failed: 502,
};

/** Counts grading requests per UTC day. In memory: a restart resets it. */
export class DailyCounter {
  private day = '';
  private count = 0;

  constructor(
    private readonly limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Records one request; false when today's limit is already used up. */
  take(): boolean {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
    if (this.count >= this.limit) return false;
    this.count++;
    return true;
  }
}

/**
 * Recent results by a hash of the photo (and request details), so sending the
 * same photo again, e.g. "Try again" after the connection dropped, doesn't pay
 * twice. In memory only; results, never images.
 */
export class ResultCache<T> {
  private entries = new Map<string, { value: T; at: number }>();

  constructor(
    private readonly max = 30,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  static key(...parts: string[]): string {
    const hash = createHash('sha256');
    for (const part of parts) hash.update(part).update('\0');
    return hash.digest('hex');
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, at: this.now() });
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
  }
}

export type AppDeps = {
  call: ModelCall;
  /** Model call for the step-by-step tutor; defaults to `call`. */
  tutorCall?: ModelCall;
  checker?: Checker;
  /** Spending log; defaults to an in-memory one. */
  usage?: UsageLog;
};

/**
 * HTTP API for the app.
 *
 * `POST /v1/grade` (multipart: `image` file, optional `unit` text). Send
 * `Accept: text/event-stream` to get progress events followed by the result;
 * otherwise the response is the GradeResult JSON. Images are processed in
 * memory and never written to disk or logged.
 *
 * `POST /v1/tutor` (multipart: `image`, `context` JSON (TutorContext), optional
 * `unit`) returns a TutorResult: one problem on the page worked out step by step.
 *
 * `GET /v1/usage` returns a UsageSummary (pages, tutor requests and dollars).
 */
export function createApp(config: ServerConfig, deps: AppDeps): Hono {
  const app = new Hono();
  const counter = new DailyCounter(config.dailyLimit);
  const usage = deps.usage ?? new UsageLog(null);
  const gradeCall = withUsage(deps.call, usage, 'grade');
  const tutorCall = withUsage(deps.tutorCall ?? deps.call, usage, 'tutor');
  const grades = new ResultCache<GradeResult>();
  const solutions = new ResultCache<TutorResult>();

  /** Shared checks before any paid request; returns an error response or null. */
  function refuse(c: Context): Response | null {
    if (config.sharedSecret && c.req.header('authorization') !== `Bearer ${config.sharedSecret}`) {
      return fail(c, 'unauthorized', 'Missing or wrong app secret.');
    }
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > config.maxUploadBytes) return fail(c, 'bad_image', 'That photo is too large. Try again with a smaller one.');
    return null;
  }

  /** Daily cap and monthly budget, checked once the request is known to be valid. */
  function overLimit(c: Context): Response | null {
    if (config.monthlyBudget > 0 && usage.monthCost() >= config.monthlyBudget) {
      return fail(c, 'over_budget', `This month's budget of $${config.monthlyBudget.toFixed(2)} is used up. Raise MONTHLY_BUDGET_USD on the server to keep going.`);
    }
    if (!counter.take()) return fail(c, 'rate_limited', "You've reached today's limit. Try again tomorrow.");
    return null;
  }

  async function tracked<T>(kind: UsageKind, run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      usage.recordRequest(kind, { ok: true });
      return result;
    } catch (error) {
      usage.recordRequest(kind, { ok: false, code: describe(error).code });
      throw error;
    }
  }

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/v1/usage', (c) => {
    if (config.sharedSecret && c.req.header('authorization') !== `Bearer ${config.sharedSecret}`) {
      return fail(c, 'unauthorized', 'Missing or wrong app secret.');
    }
    return c.json(usage.summary(config.monthlyBudget));
  });

  app.post('/v1/grade', async (c) => {
    const refused = refuse(c);
    if (refused) return refused;

    let form: Record<string, string | File>;
    try {
      form = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      return fail(c, 'bad_request', 'Expected a multipart form with an "image" file.');
    }
    const file = form.image;
    if (!(file instanceof File)) return fail(c, 'bad_request', 'Expected a multipart form with an "image" file.');
    const unit = typeof form.unit === 'string' && form.unit.trim() ? form.unit.trim().slice(0, 100) : undefined;

    const limited = overLimit(c);
    if (limited) return limited;

    const run = async (onProgress: (p: Progress) => void): Promise<GradeResult> => {
      onProgress({ stage: 'checking_image', message: 'Checking the photo' });
      const image = await prepareImage(Buffer.from(await file.arrayBuffer()), config.maxImageEdge);
      if (config.minSharpness > 0 && image.sharpness < config.minSharpness) {
        throw new GradeError('too_blurry', 'This photo looks blurry. Hold steady and retake it in good light.');
      }
      const key = ResultCache.key('grade', image.base64, unit ?? '');
      const cached = grades.get(key);
      if (cached) {
        usage.recordRequest('grade', { ok: true, cached: true });
        return cached;
      }
      const result = await tracked('grade', () => gradePage(image, { unit }, { call: gradeCall, config, checker: deps.checker }, onProgress));
      grades.set(key, result);
      return result;
    };

    if (c.req.header('accept')?.includes('text/event-stream')) {
      return streamSSE(c, async (stream) => {
        const send = (event: GradeEvent) => stream.writeSSE({ data: JSON.stringify(event) });
        await send({ type: 'progress', stage: 'received', message: 'Photo received' });
        try {
          const result = await run((p) => void send({ type: 'progress', ...p }));
          await send({ type: 'result', result });
        } catch (error) {
          const { code, message } = describe(error);
          await send({ type: 'error', code, message });
        }
      });
    }

    try {
      return c.json(await run(() => {}));
    } catch (error) {
      const { code, message } = describe(error);
      return fail(c, code, message);
    }
  });

  app.post('/v1/tutor', async (c) => {
    const refused = refuse(c);
    if (refused) return refused;

    let form: Record<string, string | File>;
    try {
      form = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      return fail(c, 'bad_request', 'Expected a multipart form with "image" and "context".');
    }
    const file = form.image;
    let context: unknown;
    try {
      context = typeof form.context === 'string' ? JSON.parse(form.context) : undefined;
    } catch {
      context = undefined;
    }
    const parsed = TutorContextSchema.safeParse(context);
    if (!(file instanceof File) || !parsed.success) {
      return fail(c, 'bad_request', 'Expected a multipart form with "image" and a valid "context".');
    }
    const unit = typeof form.unit === 'string' && form.unit.trim() ? form.unit.trim().slice(0, 100) : undefined;

    const limited = overLimit(c);
    if (limited) return limited;

    try {
      const image = await prepareImage(Buffer.from(await file.arrayBuffer()), config.maxImageEdge);
      const key = ResultCache.key('tutor', image.base64, JSON.stringify(parsed.data), unit ?? '');
      const cached = solutions.get(key);
      if (cached) {
        usage.recordRequest('tutor', { ok: true, cached: true });
        return c.json(cached);
      }
      const result = await tracked('tutor', () =>
        solveProblem(image, parsed.data, { unit }, { call: tutorCall, config, checker: deps.checker }),
      );
      solutions.set(key, result);
      return c.json(result);
    } catch (error) {
      const { code, message } = describe(error);
      return fail(c, code, message);
    }
  });

  return app;
}

function fail(c: Context, code: GradeErrorCode, message: string) {
  return c.json({ error: { code, message } }, STATUS[code]);
}

function describe(error: unknown): { code: GradeErrorCode; message: string } {
  if (error instanceof GradeError) return { code: error.code, message: error.message };
  if (error instanceof BadImageError) return { code: 'bad_image', message: error.message };
  console.error('Request failed:', error instanceof Error ? error.message : error);
  return { code: 'grading_failed', message: 'Something went wrong. Please try again.' };
}
