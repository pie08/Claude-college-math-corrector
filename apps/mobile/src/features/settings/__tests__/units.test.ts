import { describe, expect, it } from '@jest/globals';

import { parseUnit, UNITS } from '../units';

describe('parseUnit', () => {
  it('accepts a known unit', () => {
    expect(parseUnit(UNITS[1])).toBe('Derivatives');
  });

  it('drops missing or unknown values', () => {
    expect(parseUnit(null)).toBeNull();
    expect(parseUnit('')).toBeNull();
    expect(parseUnit('Linear algebra')).toBeNull();
  });
});
