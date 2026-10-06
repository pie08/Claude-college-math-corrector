import { z } from 'zod';

/**
 * The grading result the server returns to the app, and the progress events
 * it streams while grading. Shared by the server (which produces it) and the
 * app (which renders it), so both always agree on the shape.
 */

/** Box around a flawed step, normalized 0–1 to the image (x/y = top-left corner). */
export const BBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const IssueStatusSchema = z.enum(['incorrect', 'unclear']);

/** How the server checked a correction. `not_checked` until SymPy lands (Phase 5). */
export const VerificationSchema = z.enum(['cas_verified', 'cas_disagrees', 'not_checkable', 'not_checked']);

export const IssueSchema = z.object({
  id: z.string(),
  /** LaTeX of the flawed step, as read. */
  transcription: z.string(),
  status: IssueStatusSchema,
  bbox: BBoxSchema,
  /** Short, student-friendly explanation. For `unclear`, what couldn't be read. */
  explanation: z.string(),
  /** LaTeX of the corrected step. Always set for `incorrect`, null for `unclear`. */
  correction: z.string().nullable(),
  /** The concept or rule involved, e.g. "chain rule". */
  concept: z.string(),
  /** Set when later steps follow correctly from this mistake. */
  later_steps_note: z.string().nullable(),
  verification: VerificationSchema,
  /** Where the box came from: the model, or snapped to an OCR line (Phase 5). */
  bbox_source: z.enum(['model', 'ocr']),
});

export const ProblemSchema = z.object({
  id: z.string(),
  /** The problem's number as printed, e.g. "2a" or "5". */
  label: z.string(),
  /** LaTeX of the problem as read. */
  transcription: z.string(),
  issues: z.array(IssueSchema),
  /** Style points that aren't math errors, e.g. a dropped "lim". Never highlighted. */
  notation_notes: z.array(z.string()),
  /** Null when the problem has no single final answer to judge. */
  final_answer_correct: z.boolean().nullable(),
});

export const PageStatusSchema = z.enum(['ok', 'no_math_found', 'unreadable']);

export const GradeMetaSchema = z.object({
  /** Model that produced the result (differs from the requested one after a fallback). */
  model: z.string(),
  effort: z.string(),
  latency_ms: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cost_usd: z.number(),
  /** Size of the image the model saw. Boxes are normalized to it. */
  image: z.object({ width: z.number(), height: z.number() }),
  /** Model calls made beyond the first, after invalid output. */
  retries: z.number(),
  /** Higher is sharper. See the blur check in services/api. */
  sharpness: z.number(),
});

export const GradeResultSchema = z.object({
  page_status: PageStatusSchema,
  problems: z.array(ProblemSchema),
  overall_summary: z.string(),
  meta: GradeMetaSchema,
});

export const GradeStageSchema = z.enum(['received', 'checking_image', 'reading', 'writing', 'validating']);

export const GradeErrorCodeSchema = z.enum([
  'unauthorized',
  'rate_limited',
  'bad_request',
  'bad_image',
  'too_blurry',
  'model_refused',
  'grading_failed',
]);

/** Server-sent events on `POST /v1/grade` with `Accept: text/event-stream`. */
export const GradeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    stage: GradeStageSchema,
    message: z.string(),
    /** While writing: problems found so far. */
    problems_found: z.number().optional(),
  }),
  z.object({ type: z.literal('result'), result: GradeResultSchema }),
  z.object({ type: z.literal('error'), code: GradeErrorCodeSchema, message: z.string() }),
]);

export type BBox = z.infer<typeof BBoxSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Problem = z.infer<typeof ProblemSchema>;
export type PageStatus = z.infer<typeof PageStatusSchema>;
export type GradeMeta = z.infer<typeof GradeMetaSchema>;
export type GradeResult = z.infer<typeof GradeResultSchema>;
export type GradeStage = z.infer<typeof GradeStageSchema>;
export type GradeErrorCode = z.infer<typeof GradeErrorCodeSchema>;
export type GradeEvent = z.infer<typeof GradeEventSchema>;
