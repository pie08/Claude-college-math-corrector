import type { GradeResult } from '@calc/shared';

import { marksOf, type Mark } from '@/features/results/marks';

/** Counts shown on the History list. */
export function countMarks(result: GradeResult): { mistakes: number; unclear: number } {
  const marks = marksOf(result);
  const mistakes = marks.filter((m) => m.status === 'incorrect').length;
  return { mistakes, unclear: marks.length - mistakes };
}

export type CorrectionRow = {
  id: string;
  scan_id: string;
  mark_number: number;
  problem_label: string;
  concept: string;
  created_at: number;
  issue_json: string;
};

/**
 * One Corrections-list row per mistake on the page (unreadable steps have no
 * fix, so they stay on the results screen only).
 */
export function correctionRowsFor(scanId: string, createdAt: number, result: GradeResult): CorrectionRow[] {
  return marksOf(result)
    .filter((mark) => mark.status === 'incorrect')
    .map((mark) => ({
      id: `${scanId}:${mark.id}`,
      scan_id: scanId,
      mark_number: mark.number,
      problem_label: mark.problemLabel,
      concept: mark.concept.trim().toLowerCase(),
      created_at: createdAt,
      issue_json: JSON.stringify(mark),
    }));
}

/** Distinct concepts, most common first, for the filter chips. */
export function conceptsByFrequency(concepts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const c of concepts) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

export type { Mark };
