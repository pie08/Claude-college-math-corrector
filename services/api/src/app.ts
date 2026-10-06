import type { GradeErrorCode, GradeEvent, GradeResult } from '@calc/shared';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { ServerConfig } from './config';
import { gradePage, GradeError, type ModelCall, type Progress } from './grader';
import { BadImageError, prepareImage } from './image';

const STATUS: Record<GradeErrorCode, 400 | 401 | 413 | 422 | 429 | 500 | 502> = {
  unauthorized: 401,
  rate_limited: 429,
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
 * HTTP API for the app.
 *
 * `POST /v1/grade` (multipart: `image` file, optional `unit` text). Send
 * `Accept: text/event-stream` to get progress events followed by the result;
 * otherwise the response is the GradeResult JSON. Images are processed in
 * memory and never written to disk or logged.
 */
export function createApp(config: ServerConfig, call: ModelCall): Hono {
  const app = new Hono();
  const counter = new DailyCounter(config.dailyLimit);

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/v1/grade', async (c) => {
    if (config.sharedSecret && c.req.header('authorization') !== `Bearer ${config.sharedSecret}`) {
      return fail(c, 'unauthorized', 'Missing or wrong app secret.');
    }
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > config.maxUploadBytes) return fail(c, 'bad_image', 'That photo is too large. Try again with a smaller one.');

    let form: Record<string, string | File>;
    try {
      form = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      return fail(c, 'bad_request', 'Expected a multipart form with an "image" file.');
    }
    const file = form.image;
    if (!(file instanceof File)) return fail(c, 'bad_request', 'Expected a multipart form with an "image" file.');
    const unit = typeof form.unit === 'string' && form.unit.trim() ? form.unit.trim().slice(0, 100) : undefined;

    if (!counter.take()) return fail(c, 'rate_limited', "You've reached today's grading limit. Try again tomorrow.");

    const run = async (onProgress: (p: Progress) => void): Promise<GradeResult> => {
      onProgress({ stage: 'checking_image', message: 'Checking the photo' });
      const image = await prepareImage(Buffer.from(await file.arrayBuffer()), config.maxImageEdge);
      if (config.minSharpness > 0 && image.sharpness < config.minSharpness) {
        throw new GradeError('too_blurry', 'This photo looks blurry. Hold steady and retake it in good light.');
      }
      return gradePage(image, { unit }, { call, config }, onProgress);
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

  return app;
}

function fail(c: Context, code: GradeErrorCode, message: string) {
  return c.json({ error: { code, message } }, STATUS[code]);
}

function describe(error: unknown): { code: GradeErrorCode; message: string } {
  if (error instanceof GradeError) return { code: error.code, message: error.message };
  if (error instanceof BadImageError) return { code: 'bad_image', message: error.message };
  console.error('Grading failed:', error instanceof Error ? error.message : error);
  return { code: 'grading_failed', message: 'Something went wrong while grading. Please try again.' };
}
