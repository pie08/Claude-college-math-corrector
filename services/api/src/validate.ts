import type { BBox, Problem } from '@calc/shared';

import type { ModelGrade, ModelIssue } from './modelOutput';

/** Smallest box side, in pixels, that still marks something. */
const MIN_BOX_PX = 4;

export type ValidationResult =
  | { ok: true; problems: Problem[] }
  /** Problems worth one retry, phrased as feedback to the model. */
  | { ok: false; errors: string[] };

/**
 * Checks what structured outputs can't (numeric ranges and cross-field
 * rules), fixes what is safe to fix, and converts the model's output to the
 * app-facing shape with ids and normalized boxes.
 */
export function validateModelGrade(grade: ModelGrade, image: { width: number; height: number }): ValidationResult {
  const errors: string[] = [];

  const problems: Problem[] = grade.problems.map((problem, p) => {
    const problemId = `p${p + 1}`;
    return {
      id: problemId,
      label: problem.label.trim(),
      transcription: problem.transcription,
      attempted: problem.attempted,
      notation_notes: problem.notation_notes,
      final_answer_correct: problem.final_answer_correct,
      issues: problem.issues.map((issue, i) => {
        const where = `problem "${problem.label}", issue ${i + 1}`;
        const bbox = normalizeBox(issue.bbox_px, image);
        if (!bbox) {
          errors.push(
            `${where}: bbox_px ${JSON.stringify(issue.bbox_px)} is not a box inside the ${image.width}x${image.height} image.`,
          );
        }
        if (issue.status === 'incorrect' && !issue.correction?.trim()) {
          errors.push(`${where}: an incorrect step needs a correction.`);
        } else if (issue.status === 'incorrect' && sameMath(issue.correction!, issue.transcription)) {
          // A "fix" identical to the step means the step wasn't actually wrong.
          errors.push(
            `${where}: the correction is the same as the student's step, so this step is not an error. Remove the issue or flag the step that is actually wrong.`,
          );
        }
        return {
          id: `${problemId}i${i + 1}`,
          transcription: issue.transcription,
          status: issue.status,
          bbox: bbox ?? { x: 0, y: 0, w: 0, h: 0 },
          explanation: issue.explanation.trim(),
          // A correction for unreadable work would be a guess; drop it.
          correction: issue.status === 'incorrect' ? (issue.correction ?? '').trim() : null,
          // Filled in by the grader once the result is valid.
          transcription_svg: null,
          correction_svg: null,
          concept: issue.concept.trim(),
          later_steps_note: issue.later_steps_note?.trim() || null,
          verification: 'not_checked' as const,
          bbox_source: 'model' as const,
          inline_math: {},
        };
      }),
    };
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, problems };
}

/**
 * Converts a pixel box to 0–1 fractions, clamping slight overhangs past the
 * image edge. Returns null when the box is empty or entirely outside.
 */
export function normalizeBox(box: ModelIssue['bbox_px'], image: { width: number; height: number }): BBox | null {
  const left = clamp(box.x, 0, image.width);
  const top = clamp(box.y, 0, image.height);
  const right = clamp(box.x + box.w, 0, image.width);
  const bottom = clamp(box.y + box.h, 0, image.height);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  if (right - left < MIN_BOX_PX || bottom - top < MIN_BOX_PX) return null;
  return {
    x: round(left / image.width),
    y: round(top / image.height),
    w: round((right - left) / image.width),
    h: round((bottom - top) / image.height),
  };
}

/** Compares two LaTeX strings ignoring whitespace and \left / \right sizing. */
export function sameMath(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\\(left|right)\b/g, '').replace(/\s+/g, '');
  return norm(a) === norm(b);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
