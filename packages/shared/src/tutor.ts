import { z } from 'zod';

import { InlineMathSchema, VerificationSchema } from './grade';

/**
 * The step-by-step tutor: the app sends a graded page's photo plus which
 * problem to work out, and gets back a worked solution.
 */

/** What the app already knows about the problem, sent alongside the photo. */
export const TutorContextSchema = z.object({
  /** Problem number as printed, e.g. "2a". */
  label: z.string().min(1).max(20),
  /** LaTeX of the problem statement as the grader read it. */
  statement: z.string().max(2000),
  /** Mistakes the grader found in the student's work on this problem. */
  mistakes: z
    .array(z.object({ transcription: z.string().max(1000), correction: z.string().max(1000).nullable(), explanation: z.string().max(1000) }))
    .max(10),
});

export const TutorStepSchema = z.object({
  /** Short plain-text heading, e.g. "Factor the denominator". */
  title: z.string(),
  /** LaTeX for this step's math; may be empty for a reasoning-only step. */
  math: z.string(),
  math_svg: z.string().nullable(),
  /** Plain-text explanation of why the step works. */
  explanation: z.string(),
});

export const TutorResultSchema = z.object({
  label: z.string(),
  /** The problem statement (from the request's context) rendered as SVG; null if it couldn't be. */
  statement_svg: z.string().nullable().default(null),
  /** False when the photo doesn't show enough to work the problem out (e.g. a missing graph). */
  solvable: z.boolean(),
  /** One or two plain-text sentences: the plan, or where the student's work went off track. */
  intro: z.string(),
  /** Index into `steps` where the student's own work first went wrong; null when it didn't. */
  off_track_step: z.number().int().nullable(),
  steps: z.array(TutorStepSchema),
  /** LaTeX of the final answer; empty when there's no single answer. */
  final_answer: z.string(),
  final_answer_svg: z.string().nullable(),
  /** Whether SymPy confirmed the final answer. */
  verification: VerificationSchema,
  /** Rendered `$...$` math from intro and the steps' titles and explanations. */
  inline_math: InlineMathSchema,
  meta: z.object({
    model: z.string(),
    latency_ms: z.number(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    cost_usd: z.number(),
  }),
});

export type TutorContext = z.infer<typeof TutorContextSchema>;
export type TutorStep = z.infer<typeof TutorStepSchema>;
export type TutorResult = z.infer<typeof TutorResultSchema>;
