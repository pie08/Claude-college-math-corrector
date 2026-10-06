import { describe, expect, it } from 'vitest';

import type { ModelGrade } from '../src/modelOutput';
import { normalizeBox, sameMath, validateModelGrade } from '../src/validate';
import { sampleGrade } from './helpers';

describe('validateModelGrade', () => {
  it('rejects a "correction" that is the same as the flagged step', () => {
    const grade: ModelGrade = sampleGrade();
    grade.problems[0]!.issues[0]!.transcription = '\\frac{8}{4h} - \\frac{h}{4h}';
    grade.problems[0]!.issues[0]!.correction = '\\frac{8}{4h}-\\frac{h}{4h}';
    const result = validateModelGrade(grade, { width: 1000, height: 2000 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/same as the student's step/);
  });
});

describe('sameMath', () => {
  it('ignores spacing and \\left/\\right', () => {
    expect(sameMath('\\left( x+1 \\right)', '(x+1)')).toBe(true);
    expect(sameMath('-\\frac{1}{32}', '\\frac{1}{32}')).toBe(false);
  });
});

const image = { width: 1000, height: 2000 };

describe('normalizeBox', () => {
  it('converts pixels to fractions of the image', () => {
    expect(normalizeBox({ x: 250, y: 500, w: 500, h: 100 }, image)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.05 });
  });

  it('clamps boxes that overhang the edge', () => {
    expect(normalizeBox({ x: 900, y: -20, w: 300, h: 120 }, image)).toEqual({ x: 0.9, y: 0, w: 0.1, h: 0.05 });
  });

  it('rejects boxes outside the image or too small to see', () => {
    expect(normalizeBox({ x: 2000, y: 100, w: 50, h: 50 }, image)).toBeNull();
    expect(normalizeBox({ x: 10, y: 10, w: 2, h: 50 }, image)).toBeNull();
    expect(normalizeBox({ x: Number.NaN, y: 10, w: 50, h: 50 }, image)).toBeNull();
  });
});
