import type { GradeResult, Issue } from '@calc/shared';
import { describe, expect, it } from '@jest/globals';

import { formatWhen } from '../format';
import { conceptsByFrequency, correctionRowsFor, countMarks } from '../rows';

describe('formatWhen', () => {
  const now = new Date(2026, 9, 6, 21, 30); // Tue Oct 6 2026, 9:30 PM local
  it('says Today / Yesterday with the time', () => {
    expect(formatWhen(new Date(2026, 9, 6, 9, 5).getTime(), now)).toMatch(/^Today, 9:05\sAM$/);
    expect(formatWhen(new Date(2026, 9, 5, 16, 2).getTime(), now)).toMatch(/^Yesterday, 4:02\sPM$/);
  });
  it('uses the weekday within a week, then the date', () => {
    expect(formatWhen(new Date(2026, 9, 2, 10).getTime(), now)).toBe('Fri, Oct 2');
    expect(formatWhen(new Date(2026, 8, 20).getTime(), now)).toBe('Sep 20');
    expect(formatWhen(new Date(2025, 8, 20).getTime(), now)).toBe('Sep 20, 2025');
  });
});

function issue(id: string, status: Issue['status'], concept: string): Issue {
  return {
    id,
    status,
    concept,
    transcription: 'x',
    bbox: { x: 0, y: 0, w: 0.1, h: 0.1 },
    explanation: 'e',
    correction: status === 'incorrect' ? 'y' : null,
    transcription_svg: null,
    correction_svg: null,
    later_steps_note: null,
    verification: 'not_checked',
    bbox_source: 'model',
  inline_math: {},
  };
}

const result: GradeResult = {
  page_status: 'ok',
  overall_summary: 's',
  inline_math: {},
  meta: {} as GradeResult['meta'],
  problems: [
    { id: 'p1', label: '2a', transcription: '', notation_notes: [], final_answer_correct: false, attempted: true, issues: [issue('p1i1', 'incorrect', ' Limit Laws ')] },
    { id: 'p2', label: '2b', transcription: '', notation_notes: [], final_answer_correct: null, attempted: true, issues: [issue('p2i1', 'unclear', 'reading')] },
    { id: 'p3', label: '3c', transcription: '', notation_notes: [], final_answer_correct: false, attempted: true, issues: [issue('p3i1', 'incorrect', 'algebra')] },
  ],
};

describe('countMarks', () => {
  it('separates mistakes from unreadable steps', () => {
    expect(countMarks(result)).toEqual({ mistakes: 2, unclear: 1 });
  });
});

describe('correctionRowsFor', () => {
  it('makes one row per mistake, numbered as on the page, skipping unreadable steps', () => {
    const rows = correctionRowsFor('scan1', 1000, result);
    expect(rows.map((r) => [r.id, r.mark_number, r.problem_label, r.concept])).toEqual([
      ['scan1:p1i1', 1, '2a', 'limit laws'],
      ['scan1:p3i1', 3, '3c', 'algebra'],
    ]);
    expect(JSON.parse(rows[0]!.issue_json)).toMatchObject({ id: 'p1i1', number: 1, problemLabel: '2a' });
  });
});

describe('conceptsByFrequency', () => {
  it('orders concepts by how often they come up, then alphabetically', () => {
    expect(conceptsByFrequency(['chain rule', 'algebra', 'chain rule', 'limits', 'algebra', 'chain rule'])).toEqual([
      'chain rule',
      'algebra',
      'limits',
    ]);
  });
});
