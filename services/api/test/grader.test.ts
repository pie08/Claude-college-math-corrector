import { GradeResultSchema } from '@calc/shared';
import { describe, expect, it } from 'vitest';

import type { Checker } from '../src/cas';
import { countProblems, gradePage, GradeError, type Progress } from '../src/grader';
import type { CasCheck } from '../src/modelOutput';
import { config, fakeCall, image, reply, sampleGrade } from './helpers';

describe('gradePage', () => {
  it('returns a valid GradeResult with normalized boxes', async () => {
    const { call } = fakeCall([reply(JSON.stringify(sampleGrade()))]);
    const result = await gradePage(image, {}, { call, config });

    expect(GradeResultSchema.parse(result)).toEqual(result);
    const issue = result.problems[0]!.issues[0]!;
    expect(issue.bbox).toEqual({ x: 0.1, y: 0.15, w: 0.5, h: 0.03 });
    expect(issue.id).toBe('p1i1');
    expect(issue.verification).toBe('not_checked');
    // LaTeX is rendered to SVG math for the phone.
    expect(issue.transcription_svg).toMatch(/^<svg [^>]*width="[\d.]+" height="[\d.]+"/);
    expect(issue.correction_svg).toContain('currentColor');
    expect(result.meta.retries).toBe(0);
    // 3000 in at $2/M + 2000 out at $10/M
    expect(result.meta.cost_usd).toBeCloseTo(0.026);
  });

  it('includes the unit in the request only when given', async () => {
    const { call, requests } = fakeCall([reply(JSON.stringify(sampleGrade())), reply(JSON.stringify(sampleGrade()))]);
    await gradePage(image, {}, { call, config });
    await gradePage(image, { unit: 'Limits' }, { call, config });
    const text = (i: number) => JSON.stringify(requests[i]!.messages);
    expect(text(0)).not.toContain('currently studying');
    expect(text(1)).toContain('currently studying: Limits');
  });

  it('retries once with feedback when a box is outside the image, keeping the reply in the history', async () => {
    const bad = sampleGrade();
    bad.problems[0]!.issues[0]!.bbox_px = { x: 5000, y: 5000, w: 10, h: 10 };
    const { call, requests } = fakeCall([reply(JSON.stringify(bad)), reply(JSON.stringify(sampleGrade()))]);

    const result = await gradePage(image, {}, { call, config });

    expect(result.meta.retries).toBe(1);
    expect(result.meta.input_tokens).toBe(6000);
    const retry = requests[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(retry[1]!.role).toBe('assistant');
    expect(JSON.stringify(retry[2]!.content)).toContain('bbox_px');
  });

  it('retries when the output is not valid JSON, then gives up', async () => {
    const { call } = fakeCall([reply('{"oops":'), reply('still not json')]);
    await expect(gradePage(image, {}, { call, config })).rejects.toMatchObject({ code: 'grading_failed' });
  });

  it('requires a correction for incorrect steps', async () => {
    const bad = sampleGrade();
    bad.problems[0]!.issues[0]!.correction = null;
    const { call } = fakeCall([reply(JSON.stringify(bad)), reply(JSON.stringify(bad))]);
    await expect(gradePage(image, {}, { call, config })).rejects.toThrow(/needs a correction/);
  });

  it('drops corrections on unclear steps instead of guessing', async () => {
    const grade = sampleGrade();
    grade.problems[0]!.issues[0]!.status = 'unclear';
    const { call } = fakeCall([reply(JSON.stringify(grade))]);
    const result = await gradePage(image, {}, { call, config });
    expect(result.problems[0]!.issues[0]!.correction).toBeNull();
  });

  it('reports a refusal as model_refused without retrying', async () => {
    const { call, requests } = fakeCall([reply('', { stop_reason: 'refusal' })]);
    const error = await gradePage(image, {}, { call, config }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GradeError);
    expect((error as GradeError).code).toBe('model_refused');
    expect(requests).toHaveLength(1);
  });

  it('prices by the model that actually answered (after a fallback)', async () => {
    const { call } = fakeCall([reply(JSON.stringify(sampleGrade()), { model: 'claude-opus-4-8' })]);
    const result = await gradePage(image, {}, { call, config });
    expect(result.meta.model).toBe('claude-opus-4-8');
    // 3000 in at $5/M + 2000 out at $25/M
    expect(result.meta.cost_usd).toBeCloseTo(0.065);
  });

  it('reports progress through the stages', async () => {
    const { call } = fakeCall([reply(JSON.stringify(sampleGrade()))]);
    const stages: Progress[] = [];
    await gradePage(image, {}, { call, config }, (p) => stages.push(p));
    expect(stages.map((s) => s.stage)).toEqual(['reading', 'writing', 'validating']);
    expect(stages[1]!.problems_found).toBe(2);
  });
});

describe('gradePage with the SymPy checker', () => {
  it('records the checker verdict on each mistake', async () => {
    const claims: CasCheck[] = [];
    const checker: Checker = {
      check: async (claim) => {
        claims.push(claim);
        return { verdict: 'verified', detail: '' };
      },
    };
    const { call } = fakeCall([reply(JSON.stringify(sampleGrade()))]);
    const result = await gradePage(image, {}, { call, config, checker });
    expect(claims[0]).toMatchObject({ kind: 'equivalent', corrected_result: '-22' });
    expect(result.problems[0]!.issues[0]!.verification).toBe('cas_verified');
  });

  it('marks disagreements and unchecked steps', async () => {
    const grade = sampleGrade();
    grade.problems[0]!.issues.push({ ...grade.problems[0]!.issues[0]!, status: 'unclear', correction: null });
    const checker: Checker = { check: async () => ({ verdict: 'disagrees', detail: '' }) };
    const { call } = fakeCall([reply(JSON.stringify(grade))]);
    const issues = (await gradePage(image, {}, { call, config, checker })).problems[0]!.issues;
    expect(issues.map((i) => i.verification)).toEqual(['cas_disagrees', 'not_checkable']);
  });

  it('leaves verification as not_checked without a checker', async () => {
    const { call } = fakeCall([reply(JSON.stringify(sampleGrade()))]);
    const result = await gradePage(image, {}, { call, config });
    expect(result.problems[0]!.issues[0]!.verification).toBe('not_checked');
  });
});

describe('countProblems', () => {
  it('counts problem labels in partial JSON', () => {
    expect(countProblems('{"problems":[{"label": "1a","issues":[]},{"label":"1b"')).toBe(2);
    expect(countProblems('{"page_status":"ok"')).toBe(0);
  });
});
