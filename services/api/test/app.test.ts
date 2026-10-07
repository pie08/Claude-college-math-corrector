import { GradeEventSchema, GradeResultSchema } from '@calc/shared';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp, DailyCounter } from '../src/app';
import type { ServerConfig } from '../src/config';
import { fakeCall, reply, sampleGrade } from './helpers';

const config: ServerConfig = {
  model: 'claude-sonnet-5-5',
  effort: 'high',
  refusalFallback: true,
  maxImageEdge: 2048,
  minSharpness: 0,
  port: 0,
  sharedSecret: 'test-secret',
  tutorEffort: 'medium',
  dailyLimit: 2,
  maxUploadBytes: 5_000_000,
};

let jpeg: Buffer;
beforeAll(async () => {
  // A small white page with a dark stroke, so it decodes and has some edges.
  jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 400, height: 8, channels: 3, background: '#111111' } }, top: 300, left: 200 }])
    .jpeg()
    .toBuffer();
});

function upload(headers: Record<string, string> = {}, body?: FormData) {
  const form = body ?? new FormData();
  if (!body) form.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'page.jpg');
  return new Request('http://test/v1/grade', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret', ...headers },
    body: form,
  });
}

function app(replies = 5) {
  const { call } = fakeCall(Array.from({ length: replies }, () => reply(JSON.stringify(sampleGrade()))));
  return createApp(config, call);
}

describe('POST /v1/grade', () => {
  it('rejects requests without the shared secret', async () => {
    const res = await app().request(upload({ authorization: 'Bearer nope' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('rejects a form without an image', async () => {
    const res = await app().request(upload({}, new FormData()));
    expect(res.status).toBe(400);
  });

  it('rejects files that are not images', async () => {
    const form = new FormData();
    form.append('image', new Blob(['not an image'], { type: 'image/jpeg' }), 'x.jpg');
    const res = await app().request(upload({}, form));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'bad_image' } });
  });

  it('returns the GradeResult as JSON', async () => {
    const res = await app().request(upload());
    expect(res.status).toBe(200);
    const body = GradeResultSchema.parse(await res.json());
    expect(body.meta.image).toEqual({ width: 800, height: 1000 });
  });

  it('streams progress events and then the result over SSE', async () => {
    const res = await app().request(upload({ accept: 'text/event-stream' }));
    const events = (await res.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => GradeEventSchema.parse(JSON.parse(line.slice(6))));
    expect(events[0]).toMatchObject({ type: 'progress', stage: 'received' });
    expect(events.at(-1)!.type).toBe('result');
    expect(events.filter((e) => e.type === 'progress').map((e) => e.type === 'progress' && e.stage)).toContain('reading');
  });

  it('enforces the daily limit', async () => {
    const a = app();
    expect((await a.request(upload())).status).toBe(200);
    expect((await a.request(upload())).status).toBe(200);
    const res = await a.request(upload());
    expect(res.status).toBe(429);
  });
});

describe('DailyCounter', () => {
  it('resets at the start of each UTC day', () => {
    let now = new Date('2026-10-07T23:59:00Z');
    const counter = new DailyCounter(1, () => now);
    expect(counter.take()).toBe(true);
    expect(counter.take()).toBe(false);
    now = new Date('2026-10-08T00:01:00Z');
    expect(counter.take()).toBe(true);
  });
});
