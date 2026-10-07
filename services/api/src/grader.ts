import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { GradeErrorCode, GradeResult, GradeStage, Problem } from '@calc/shared';
import type { z } from 'zod';

import { tightenBoxes } from './boxes';
import type { Checker } from './cas';
import type { Effort, GraderConfig } from './config';
import type { PreparedImage } from './image';
import { renderMathSvg } from './math';
import { ModelGradeSchema, type ModelGrade } from './modelOutput';
import { estimateCost } from './pricing';
import { SYSTEM_PROMPT, userPrompt } from './prompt';
import { validateModelGrade } from './validate';

/** Model calls per page: the first try plus one retry on invalid output. */
const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 32000;

export type Progress = { stage: GradeStage; message: string; problems_found?: number };

export class GradeError extends Error {
  constructor(
    readonly code: GradeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Sends one request to Claude and resolves with the final message. Takes a
 * text-snapshot callback for progress. Swapped for a fake in tests.
 */
export type ModelCall = (
  params: { system: string; messages: Anthropic.Beta.BetaMessageParam[] },
  onText: (snapshot: string) => void,
) => Promise<Anthropic.Beta.BetaMessage>;

export function claudeModelCall(
  client: Anthropic,
  config: GraderConfig,
  output: { schema: z.ZodType; effort?: Effort } = { schema: ModelGradeSchema },
): ModelCall {
  const format = zodOutputFormat(output.schema);
  return async ({ system, messages }, onText) => {
    const stream = client.beta.messages.stream({
      model: config.model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      output_config: { effort: output.effort ?? config.effort, format },
      // If a safety classifier wrongly declines the page, Anthropic re-runs it
      // on its recommended fallback model instead of failing.
      ...(config.refusalFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    stream.on('text', (_delta, snapshot) => onText(snapshot));
    return stream.finalMessage();
  };
}

/**
 * Grades one page: asks Claude for structured JSON, validates it, and asks
 * once more with feedback if it's invalid. Never stores the image.
 */
export async function gradePage(
  image: PreparedImage,
  opts: { unit?: string },
  deps: { call: ModelCall; config: GraderConfig; checker?: Checker },
  onProgress: (progress: Progress) => void = () => {},
): Promise<GradeResult> {
  const started = Date.now();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.base64 } },
        { type: 'text', text: userPrompt({ width: image.width, height: image.height, unit: opts.unit }) },
      ],
    },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let servedBy = deps.config.model;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress({ stage: 'reading', message: attempt === 1 ? 'Reading your work' : 'Double-checking the results' });

    let lastCount = -1;
    const response = await deps.call({ system: SYSTEM_PROMPT, messages }, (snapshot) => {
      const count = countProblems(snapshot);
      if (count !== lastCount) {
        lastCount = count;
        onProgress({ stage: 'writing', message: 'Writing up the results', problems_found: count });
      }
    });

    servedBy = response.model;
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    cost += estimateCost(response.model, response.usage.input_tokens, response.usage.output_tokens);

    if (response.stop_reason === 'refusal') {
      throw new GradeError('model_refused', "This page couldn't be graded. Try a photo with just the math work.");
    }

    onProgress({ stage: 'validating', message: 'Checking the results' });
    const errors = response.stop_reason === 'max_tokens' ? ['The output was cut off.'] : [];
    let parsed: ReturnType<typeof ModelGradeSchema.safeParse> | undefined;
    if (errors.length === 0) {
      parsed = ModelGradeSchema.safeParse(parseJson(responseText(response)));
      if (!parsed.success) errors.push('The output did not match the required JSON schema.');
    }

    if (parsed?.success) {
      const validated = validateModelGrade(parsed.data, image);
      if (validated.ok) {
        let problems = withMathSvgs(validated.problems);
        if (deps.checker && problems.some((p) => p.issues.some((i) => i.status === 'incorrect'))) {
          onProgress({ stage: 'validating', message: 'Double-checking the math' });
          problems = await verifyCorrections(problems, parsed.data, deps.checker);
        }
        problems = await tightenBoxes(problems, image);
        return {
          page_status: parsed.data.page_status,
          problems,
          overall_summary: parsed.data.overall_summary.trim(),
          meta: {
            model: servedBy,
            effort: deps.config.effort,
            latency_ms: Date.now() - started,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: Math.round(cost * 1e5) / 1e5,
            image: { width: image.width, height: image.height },
            retries: attempt - 1,
            sharpness: image.sharpness,
          },
        };
      }
      errors.push(...validated.errors);
    }

    if (attempt === MAX_ATTEMPTS) {
      throw new GradeError('grading_failed', `Grading returned invalid results: ${errors.join(' ')}`);
    }
    // Keep the conversation append-only: echo the reply unchanged, then give feedback.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: `Your JSON had these problems:\n- ${errors.join('\n- ')}\nReturn the complete corrected JSON for the whole page.`,
    });
  }

  throw new GradeError('grading_failed', 'Grading failed.');
}

/**
 * Asks the SymPy checker to confirm each correction. Issues line up with the
 * model's output by position (validation keeps the order).
 */
async function verifyCorrections(problems: Problem[], grade: ModelGrade, checker: Checker): Promise<Problem[]> {
  const VERDICTS = { verified: 'cas_verified', disagrees: 'cas_disagrees', not_checkable: 'not_checkable' } as const;
  return Promise.all(
    problems.map(async (problem, p) => ({
      ...problem,
      issues: await Promise.all(
        problem.issues.map(async (issue, i) => {
          const claim = grade.problems[p]?.issues[i]?.cas_check;
          if (issue.status !== 'incorrect' || !claim) return { ...issue, verification: 'not_checkable' as const };
          const { verdict } = await checker.check(claim);
          return { ...issue, verification: VERDICTS[verdict] };
        }),
      ),
    })),
  );
}

/** Renders each issue's LaTeX to SVG so the phone can show real math notation. */
function withMathSvgs(problems: Problem[]): Problem[] {
  return problems.map((problem) => ({
    ...problem,
    issues: problem.issues.map((issue) => ({
      ...issue,
      transcription_svg: renderMathSvg(issue.transcription),
      correction_svg: issue.correction ? renderMathSvg(issue.correction) : null,
    })),
  }));
}

export function responseText(response: Anthropic.Beta.BetaMessage): string {
  return response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Problems seen so far in partially streamed JSON, for progress updates. */
export function countProblems(partialJson: string): number {
  return partialJson.match(/"label"\s*:/g)?.length ?? 0;
}
