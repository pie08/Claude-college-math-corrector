import type Anthropic from '@anthropic-ai/sdk';
import type { TutorContext, TutorResult } from '@calc/shared';
import { z } from 'zod';

import type { Checker } from './cas';
import type { GraderConfig } from './config';
import { GradeError, parseJson, responseText, type ModelCall } from './grader';
import type { PreparedImage } from './image';
import { collectInlineMath, renderMathSvg } from './math';
import { CasCheckSchema } from './modelOutput';
import { estimateCost, totalInputTokens } from './pricing';

/** What Claude returns for a worked solution (enforced with structured outputs). */
export const TutorModelSchema = z.strictObject({
  solvable: z.boolean(),
  intro: z.string(),
  off_track_step: z.number().nullable(),
  steps: z.array(z.strictObject({ title: z.string(), math: z.string(), explanation: z.string() })),
  final_answer: z.string(),
  cas_check: CasCheckSchema,
});

export const TUTOR_PROMPT = `You are a patient calculus tutor. The student photographed a page of their work and picked one problem on it. Work that problem out step by step so they can follow and learn the method.

Find the problem by its label on the page. Use the printed question and anything it refers to on the page (given values, a graph, earlier parts). If the page doesn't show enough to solve it, set solvable to false, explain what's missing in intro, and leave steps empty.

Steps:
- Each step is one move a student would write as one line: a title (a few plain words naming the move, like "Factor the denominator", no math), the math for that line, and an explanation of why it's allowed or what rule it uses in one short sentence (about 15 words at most). Let the math carry the step; don't repeat it in words.
- Use the standard method a calculus course teaches for this kind of problem, not a shortcut the student wouldn't know. The student's own instructions, when given, override this choice. Show the algebra; don't skip from setup to answer.
- Usually 3 to 10 steps. Don't pad.
- Write to the student ("you") in a kind, plain voice.

If mistakes from the student's work are listed: say in intro, in one short sentence, where their work went off track and why. Follow the student's own approach up to that point when it was valid, and set off_track_step to the index (0-based) of the first step where the correct work differs from theirs. With no mistakes listed, off_track_step is null and intro gives the plan in one short sentence.

final_answer is the answer in LaTeX ("" if the problem has no single answer, like a proof or a sketch).

cas_check lets a computer algebra system confirm the final answer. Describe what the problem computes, in SymPy syntax (x**2, sqrt(x), exp(x), log(x), pi, oo, DNE), and put the final answer in corrected_result; leave student_result "". Kinds: "equivalent" or "evaluate" (expression should equal the answer), "derivative" (of expression in variable), "antiderivative" (of expression), "definite_integral" (expression from lower to upper), "limit" (expression as variable → point, direction +, - or both), "ode_solution" (the equation moved to one side = 0 with y, yp, ypp; conditions like "y(0) = 1, yp(0) = 2" or ""; the explicit solution with C, C1, C2 as constants), or "none" when it can't be checked that way. A wrong cas_check is worse than "none". Leave unused fields "".

Math notation: math and final_answer are plain LaTeX without $ delimiters. In intro and explanation, write every piece of math as inline LaTeX between single dollar signs, e.g. "The integral of $-\\frac{1}{x}$ is $-\\ln x$, so $\\mu = \\frac{1}{x}$." Never write math as typed text there (no x^2, e^(-ln x) or 1/x outside dollar signs), and never use LaTeX commands outside dollar signs.`;

export function tutorPrompt(context: TutorContext, unit?: string): string {
  const lines = [`Work out problem ${context.label} on this page.`];
  if (context.statement) lines.push(`The grader read the problem as: ${context.statement}`);
  if (context.mistakes.length > 0) {
    lines.push(
      'Mistakes found in the student’s work on this problem:',
      ...context.mistakes.map(
        (m, i) => `${i + 1}. They wrote ${m.transcription}. ${m.explanation}${m.correction ? ` Correct step: ${m.correction}` : ''}`,
      ),
    );
  } else if (!context.attempted) {
    lines.push('The student hasn’t written any work for this problem yet. Work it out from the start; intro gives the plan.');
  } else {
    lines.push('No mistakes were found in the student’s work on this problem.');
  }
  if (unit) lines.push(`The student is currently studying: ${unit}.`);
  const instructions = context.instructions.trim();
  if (instructions) {
    lines.push(
      `The student's instructions for this solution: "${instructions}". Follow them, for example by using the method they ask for (such as the limit definition instead of shortcut rules) even when a faster way exists. If an instruction can't be followed, say why in intro and do the closest valid thing.`,
    );
  }
  return lines.join('\n');
}

const MAX_ATTEMPTS = 2;

/** Works out one problem from a graded page. Never stores the image. */
export async function solveProblem(
  image: PreparedImage,
  context: TutorContext,
  opts: { unit?: string },
  deps: { call: ModelCall; config: GraderConfig; checker?: Checker },
): Promise<TutorResult> {
  const started = Date.now();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.base64 } },
        { type: 'text', text: tutorPrompt(context, opts.unit) },
      ],
    },
  ];
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await deps.call({ system: TUTOR_PROMPT, messages }, () => {});
    inputTokens += totalInputTokens(response.usage);
    outputTokens += response.usage.output_tokens;
    cost += estimateCost(response.model, response.usage);
    if (response.stop_reason === 'refusal') {
      throw new GradeError('model_refused', "This problem couldn't be worked out. Try another one.");
    }

    const parsed = response.stop_reason === 'max_tokens' ? undefined : TutorModelSchema.safeParse(parseJson(responseText(response)));
    if (parsed?.success) {
      const out = parsed.data;
      const steps = out.solvable ? out.steps : [];
      const offTrack =
        context.mistakes.length > 0 && out.off_track_step !== null && out.off_track_step >= 0 && out.off_track_step < steps.length
          ? Math.round(out.off_track_step)
          : null;
      let verification: TutorResult['verification'] = 'not_checked';
      if (deps.checker && out.solvable && out.final_answer.trim()) {
        const { verdict } = await deps.checker.check(out.cas_check);
        verification = verdict === 'verified' ? 'cas_verified' : verdict === 'disagrees' ? 'cas_disagrees' : 'not_checkable';
      }
      return {
        label: context.label,
        instructions: context.instructions.trim(),
        statement_svg: context.statement.trim() ? renderMathSvg(context.statement) : null,
        solvable: out.solvable,
        intro: out.intro.trim(),
        off_track_step: offTrack,
        steps: steps.map((step) => ({
          title: step.title.trim(),
          math: step.math,
          math_svg: step.math.trim() ? renderMathSvg(step.math) : null,
          explanation: step.explanation.trim(),
        })),
        final_answer: out.final_answer,
        final_answer_svg: out.final_answer.trim() ? renderMathSvg(out.final_answer) : null,
        verification,
        inline_math: collectInlineMath([out.intro, ...steps.flatMap((step) => [step.title, step.explanation])]),
        meta: {
          model: response.model,
          latency_ms: Date.now() - started,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: Math.round(cost * 1e5) / 1e5,
        },
      };
    }

    if (attempt === MAX_ATTEMPTS) throw new GradeError('grading_failed', 'The tutor returned an invalid answer. Please try again.');
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: 'Your JSON did not match the required schema or was cut off. Return the complete JSON again.' });
  }
  throw new GradeError('grading_failed', 'The tutor failed.');
}
