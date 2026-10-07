import type { GradeResult, Issue } from '@calc/shared';
import { describe, expect, it } from '@jest/globals';

import { tutorableProblems, tutorContextFor } from '../context';

const issue = (status: Issue['status'], explanation: string): Issue => ({
  id: explanation,
  transcription: 'x^2',
  status,
  bbox: { x: 0, y: 0, w: 0.1, h: 0.1 },
  explanation,
  correction: status === 'incorrect' ? '2x' : null,
  transcription_svg: null,
  correction_svg: null,
  concept: 'power rule',
  later_steps_note: null,
  verification: 'not_checked',
  bbox_source: 'model',
  inline_math: {},
});

const result = {
  page_status: 'ok',
  problems: [
    { id: 'p1', label: '1', transcription: '\frac{d}{dx}x^2', issues: [issue('incorrect', 'wrong power'), issue('unclear', 'smudged')], notation_notes: [], final_answer_correct: false },
    { id: 'p2', label: '2', transcription: '\int x\,dx', issues: [], notation_notes: [], final_answer_correct: true },
  ],
  overall_summary: '',
  inline_math: {},
  meta: { model: 'm', effort: 'high', latency_ms: 1, input_tokens: 1, output_tokens: 1, cost_usd: 0, image: { width: 1, height: 1 }, retries: 0, sharpness: 1 },
} as GradeResult;

describe('tutorContextFor', () => {
  it('sends the statement and only real mistakes', () => {
    expect(tutorContextFor(result, '1')).toEqual({
      label: '1',
      statement: '\frac{d}{dx}x^2',
      mistakes: [{ transcription: 'x^2', correction: '2x', explanation: 'wrong power' }],
    });
  });

  it('handles a problem with no mistakes', () => {
    expect(tutorContextFor(result, '2').mistakes).toEqual([]);
  });
});

describe('tutorableProblems', () => {
  it('lists problems in page order and marks the ones with mistakes', () => {
    expect(tutorableProblems(result)).toEqual([
      { label: '1', hasMistake: true },
      { label: '2', hasMistake: false },
    ]);
  });

  it('offers nothing for an unreadable page', () => {
    expect(tutorableProblems({ ...result, page_status: 'unreadable' })).toEqual([]);
  });
});
