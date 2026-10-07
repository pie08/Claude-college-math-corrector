import type { GradeResult, Issue } from '@calc/shared';

/** An issue with its problem label and its number in reading order (as shown on the page). */
export type Mark = Issue & { number: number; problemLabel: string };

/** Flattens a result's issues in reading order, numbering them from 1. */
export function marksOf(result: GradeResult): Mark[] {
  const marks: Mark[] = [];
  for (const problem of result.problems) {
    for (const issue of problem.issues) {
      marks.push({ ...issue, number: marks.length + 1, problemLabel: problem.label });
    }
  }
  return marks;
}
