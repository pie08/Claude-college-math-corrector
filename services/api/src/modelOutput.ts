import { z } from 'zod';

/**
 * The JSON shape Claude must return (enforced with structured outputs).
 * It differs from the app-facing GradeResult: boxes are in pixels of the
 * image the model saw (models locate things in pixels far better than in
 * fractions), and server-only fields like `verification` are absent.
 *
 * Structured outputs can't express numeric ranges, so bounds are checked in
 * validate.ts instead of here.
 */
/**
 * A machine-checkable version of the flagged step, in SymPy syntax, so the
 * server can verify the correction independently. Unused fields are "".
 */
export const CasCheckSchema = z.strictObject({
  kind: z.enum(['equivalent', 'derivative', 'antiderivative', 'definite_integral', 'limit', 'evaluate', 'none']),
  variable: z.string(),
  expression: z.string(),
  point: z.string(),
  /** "+", "-" or "both" for limits; "" otherwise (the checker treats anything else as both). */
  direction: z.string(),
  lower: z.string(),
  upper: z.string(),
  student_result: z.string(),
  corrected_result: z.string(),
});

export const ModelIssueSchema = z.strictObject({
  status: z.enum(['incorrect', 'unclear']),
  transcription: z.string().describe('LaTeX of the flawed or unreadable step, exactly as the student wrote it'),
  bbox_px: z
    .strictObject({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .describe('Tight box around that step in image pixels; x,y is the top-left corner'),
  explanation: z.string(),
  correction: z.string().nullable().describe('LaTeX of the corrected step; null when status is unclear'),
  concept: z.string(),
  later_steps_note: z.string().nullable(),
  cas_check: CasCheckSchema,
});

export const ModelProblemSchema = z.strictObject({
  label: z.string().describe('Problem number as printed, including the question number, e.g. "2a" or "5"'),
  transcription: z.string().describe('LaTeX of the problem statement as read'),
  issues: z.array(ModelIssueSchema),
  notation_notes: z.array(z.string()),
  final_answer_correct: z.boolean().nullable(),
});

export const ModelGradeSchema = z.strictObject({
  page_status: z.enum(['ok', 'no_math_found', 'unreadable']),
  problems: z.array(ModelProblemSchema),
  overall_summary: z.string(),
});

export type CasCheck = z.infer<typeof CasCheckSchema>;
export type ModelIssue = z.infer<typeof ModelIssueSchema>;
export type ModelGrade = z.infer<typeof ModelGradeSchema>;
