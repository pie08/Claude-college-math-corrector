import type { GradeResult } from '@calc/shared';
import { describe, expect, it } from 'vitest';

import { normalizeLabel, parseAnswerKey, scorePage, totals } from '../src/evalScoring';

const KEY = `
# Key

### page-02.jpg (Question 2)
- 2a: wrong at line 1: pulled out 8 → -22
- 2b: wrong at line 1: parentheses → DNE
- 2c: correct (1)

### pictures/hw.jpg
- 4a: notation: dropped lim
- 4a: correct
- 6: excluded: graph
- not an entry line
`;

function result(problems: { label: string; incorrect?: number; unclear?: number; notation?: string[] }[]): GradeResult {
  const issue = (status: 'incorrect' | 'unclear') => ({
    id: 'x',
    transcription: '',
    status,
    bbox: { x: 0, y: 0, w: 0.1, h: 0.1 },
    explanation: '',
    correction: status === 'incorrect' ? 'fix' : null,
    transcription_svg: null,
    correction_svg: null,
    concept: '',
    later_steps_note: null,
    verification: 'not_checked' as const,
    bbox_source: 'model' as const,
    inline_math: {},
  });
  return {
    page_status: 'ok',
    overall_summary: '',
    inline_math: {},
    meta: {} as GradeResult['meta'],
    problems: problems.map((p, i) => ({
      id: `p${i}`,
      label: p.label,
      transcription: '',
      notation_notes: p.notation ?? [],
      final_answer_correct: null,
      issues: [
        ...Array.from({ length: p.incorrect ?? 0 }, () => issue('incorrect')),
        ...Array.from({ length: p.unclear ?? 0 }, () => issue('unclear')),
      ],
    })),
  };
}

describe('parseAnswerKey', () => {
  it('reads pages and entries, ignoring other lines', () => {
    const pages = parseAnswerKey(KEY);
    expect(pages.map((p) => p.image)).toEqual(['page-02.jpg', 'pictures/hw.jpg']);
    expect(pages[0]!.entries.map((e) => [e.part, e.kind])).toEqual([
      ['2a', 'wrong'],
      ['2b', 'wrong'],
      ['2c', 'correct'],
    ]);
    expect(pages[1]!.entries.map((e) => e.kind)).toEqual(['notation', 'correct', 'excluded']);
  });
});

describe('normalizeLabel', () => {
  it('makes printed labels comparable', () => {
    expect(normalizeLabel('2(a)')).toBe('2a');
    expect(normalizeLabel(' 2 A. ')).toBe('2a');
  });
});

describe('scorePage', () => {
  const [page2, pictures] = parseAnswerKey(KEY);

  it('counts caught, missed, false and unmatched flags by part', () => {
    const score = scorePage(page2!, result([{ label: '2(a)', incorrect: 2 }, { label: '2c', incorrect: 1 }, { label: '3', incorrect: 1 }]));
    expect(score.caught).toEqual(['2a']);
    expect(score.missed).toEqual(['2b']);
    expect(score.falseFlags).toEqual(['2c']);
    expect(score.unmatched).toEqual(['3']);
  });

  it('ignores excluded parts and tracks notation separately', () => {
    const score = scorePage(pictures!, result([{ label: '6', incorrect: 1 }, { label: '4a', unclear: 1, notation: ['lim'] }]));
    expect(score.falseFlags).toEqual([]);
    expect(score.unmatched).toEqual([]);
    expect(score.unclearCount).toBe(1);
    expect(score.notationNoted).toEqual(['4a']);
  });
});

describe('totals', () => {
  it('computes precision and recall, counting unmatched flags against precision', () => {
    const [page2] = parseAnswerKey(KEY);
    const s = scorePage(page2!, result([{ label: '2a', incorrect: 1 }, { label: '2c', incorrect: 1 }, { label: '9', incorrect: 1 }]));
    const t = totals([s]);
    expect(t.precision).toBeCloseTo(1 / 3);
    expect(t.recall).toBeCloseTo(1 / 2);
  });

  it('treats no flags and no errors as perfect', () => {
    expect(totals([])).toMatchObject({ precision: 1, recall: 1 });
  });
});
