import { afterAll, describe, expect, it } from 'vitest';

import { CasWorker } from '../src/cas';
import type { CasCheck } from '../src/modelOutput';

const claim = (over: Partial<CasCheck>): CasCheck => ({
  kind: 'limit',
  variable: 'x',
  expression: '(sqrt(x+6)-3)/(x**2-9)',
  point: '3',
  direction: 'both',
  lower: '',
  upper: '',
  student_result: '1/32',
  corrected_result: '1/36',
  ...over,
});

// Runs the real Python worker (services/cas/.venv). Skipped if Python is missing.
const worker = new CasWorker();
afterAll(() => worker.close());

describe('CasWorker (real SymPy)', () => {
  it('verifies a correct fix and flags a wrong one', async () => {
    const ok = await worker.check(claim({}));
    if (ok.detail === 'Python checker unavailable') return; // no Python on this machine
    expect(ok.verdict).toBe('verified');
    expect((await worker.check(claim({ corrected_result: '1/32' }))).verdict).toBe('disagrees');
  });

  it('answers not_checkable for kind none without calling Python', async () => {
    expect((await worker.check(claim({ kind: 'none' }))).verdict).toBe('not_checkable');
  });

  it('keeps answering after a bad request', async () => {
    const bad = await worker.check(claim({ expression: '__import__("os")' }));
    expect(bad.verdict).toBe('not_checkable');
    const next = await worker.check(claim({}));
    expect(['verified', 'not_checkable']).toContain(next.verdict);
  });
});
