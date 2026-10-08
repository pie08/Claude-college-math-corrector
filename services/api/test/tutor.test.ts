import { TutorResultSchema, type TutorContext } from '@calc/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { Checker } from '../src/cas';
import type { ServerConfig } from '../src/config';
import { solveProblem, tutorPrompt } from '../src/tutor';
import { config, fakeCall, image, reply } from './helpers';

const context: TutorContext = {
  label: '2a',
  attempted: true,
  instructions: '',
  statement: '\lim_{x\to 2} [2f(x) - 4g(x)]',
  mistakes: [{ transcription: '8(f(x)-g(x))', correction: '2(-3) - 4(4)', explanation: 'The 2 and 4 can’t be pulled out together.' }],
};

const solution = (over: Record<string, unknown> = {}) => ({
  solvable: true,
  intro: 'You pulled the 2 and the 4 out together; each limit gets its own constant.',
  off_track_step: 0,
  steps: [
    { title: 'Split the limit', math: '2\lim f(x) - 4\lim g(x)', explanation: 'Limits of sums split.' },
    { title: 'Substitute', math: '2(-3) - 4(4) = -22', explanation: 'Use the given limits.' },
  ],
  final_answer: '-22',
  cas_check: {
    kind: 'equivalent', variable: 'x', expression: '2*(-3) - 4*4', point: '', direction: '', lower: '', upper: '',
    conditions: '', student_result: '', corrected_result: '-22',
  },
  ...over,
});

const verifying: Checker = { check: async () => ({ verdict: 'verified', detail: '' }) };

describe('tutorPrompt', () => {
  it('names the problem and lists the mistakes', () => {
    const text = tutorPrompt(context, 'Limits and continuity');
    expect(text).toContain('problem 2a');
    expect(text).toContain('8(f(x)-g(x))');
    expect(text).toContain('Limits and continuity');
  });

  it('says when no mistakes were found', () => {
    expect(tutorPrompt({ ...context, mistakes: [] })).toContain('No mistakes were found');
  });

  it("passes on the student's instructions", () => {
    const text = tutorPrompt({ ...context, instructions: '  Use the limit definition of the derivative ' });
    expect(text).toContain('"Use the limit definition of the derivative"');
    expect(tutorPrompt(context)).not.toContain('instructions for this solution');
  });

  it('works an unattempted problem from the start', () => {
    const text = tutorPrompt({ ...context, attempted: false, mistakes: [] });
    expect(text).toContain('hasn’t written any work');
    expect(text).not.toContain('No mistakes were found');
  });
});

describe('solveProblem', () => {
  it('returns steps with rendered math and a verified answer', async () => {
    const { call } = fakeCall([reply(JSON.stringify(solution()))]);
    const result = await solveProblem(image, context, {}, { call, config, checker: verifying });
    expect(TutorResultSchema.parse(result)).toBeTruthy();
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.math_svg).toContain('<svg');
    expect(result.final_answer_svg).toContain('<svg');
    expect(result.off_track_step).toBe(0);
    expect(result.verification).toBe('cas_verified');
    expect(result.instructions).toBe('');
  });

  it('drops an off-track step when there were no mistakes or it is out of range', async () => {
    const { call } = fakeCall([reply(JSON.stringify(solution({ off_track_step: 7 })))]);
    expect((await solveProblem(image, context, {}, { call, config })).off_track_step).toBeNull();
    const second = fakeCall([reply(JSON.stringify(solution()))]);
    expect((await solveProblem(image, { ...context, mistakes: [] }, {}, { call: second.call, config })).off_track_step).toBeNull();
  });

  it('returns no steps when the problem is not solvable from the photo', async () => {
    const { call } = fakeCall([reply(JSON.stringify(solution({ solvable: false, intro: 'The graph is not on this page.' })))]);
    const result = await solveProblem(image, context, {}, { call, config, checker: verifying });
    expect(result.steps).toEqual([]);
    expect(result.verification).toBe('not_checked');
  });

  it('retries once on invalid JSON, keeping the conversation append-only', async () => {
    const { call, requests } = fakeCall([reply('{"oops": 1}'), reply(JSON.stringify(solution()))]);
    const result = await solveProblem(image, context, {}, { call, config });
    expect(result.steps).toHaveLength(2);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.messages).toHaveLength(3);
    expect(requests[1]!.messages.slice(0, 1)).toEqual(requests[0]!.messages);
  });
});

describe('POST /v1/tutor', () => {
  const serverConfig: ServerConfig = {
    ...config, port: 0, sharedSecret: 'test-secret', tutorEffort: 'medium', dailyLimit: 5, maxUploadBytes: 5_000_000,
    monthlyBudget: 0, usageLogPath: '',
  };

  async function request(form: FormData) {
    const { call } = fakeCall([reply(JSON.stringify(solution()))]);
    const app = createApp(serverConfig, { call });
    return app.request(new Request('http://test/v1/tutor', { method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: form }));
  }

  it('works out a problem', async () => {
    const jpeg = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'page.jpg');
    form.append('context', JSON.stringify(context));
    const res = await request(form);
    expect(res.status).toBe(200);
    expect(TutorResultSchema.parse(await res.json()).label).toBe('2a');
  });

  it('rejects a missing or invalid context', async () => {
    const form = new FormData();
    form.append('image', new Blob(['x'], { type: 'image/jpeg' }), 'page.jpg');
    form.append('context', '{"label": ""}');
    expect((await request(form)).status).toBe(400);
  });
});
