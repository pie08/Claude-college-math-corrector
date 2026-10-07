import type { GradeResult, TutorContext } from '@calc/shared';

/** What to send the tutor for one problem on a graded page: its statement and the mistakes found in it. */
export function tutorContextFor(result: GradeResult, label: string): TutorContext {
  const problem = result.problems.find((p) => p.label === label);
  return {
    label,
    statement: problem?.transcription.slice(0, 2000) ?? '',
    attempted: problem?.attempted ?? true,
    mistakes: (problem?.issues ?? [])
      .filter((issue) => issue.status === 'incorrect')
      .slice(0, 10)
      .map((issue) => ({
        transcription: issue.transcription.slice(0, 1000),
        correction: issue.correction?.slice(0, 1000) ?? null,
        explanation: issue.explanation.slice(0, 1000),
      })),
  };
}

/** Problems on the page the tutor can work out, in page order. */
export function tutorableProblems(result: GradeResult): { label: string; hasMistake: boolean; attempted: boolean }[] {
  if (result.page_status !== 'ok') return [];
  return result.problems.map((p) => ({
    label: p.label,
    hasMistake: p.issues.some((i) => i.status === 'incorrect'),
    attempted: p.attempted,
  }));
}

/**
 * What to do right after grading a page with no work on it: open the tutor
 * for its only problem, or ask which problem to work out. Null when there's
 * work to check (the normal results screen).
 */
export function autoTutorTarget(result: GradeResult): { label: string } | 'choose' | null {
  if (result.page_status !== 'ok' || result.problems.length === 0) return null;
  if (result.problems.some((p) => p.attempted)) return null;
  return result.problems.length === 1 ? { label: result.problems[0]!.label } : 'choose';
}
