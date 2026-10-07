import type Anthropic from '@anthropic-ai/sdk';

import type { GraderConfig } from '../src/config';
import type { ModelCall } from '../src/grader';
import type { PreparedImage } from '../src/image';
import type { ModelGrade } from '../src/modelOutput';

export const config: GraderConfig = {
  model: 'claude-sonnet-5-5',
  effort: 'high',
  refusalFallback: true,
  maxImageEdge: 2048,
  minSharpness: 0,
};

export const image: PreparedImage = { base64: 'AAAA', width: 1000, height: 2000, sharpness: 500 };

/** A plausible grading reply for a page with one mistake. */
export function sampleGrade(overrides: Partial<ModelGrade> = {}): ModelGrade {
  return {
    page_status: 'ok',
    problems: [
      {
        label: '2a',
        transcription: '\\lim_{x\\to 2} 2f(x) - x^2 g(x)',
        issues: [
          {
            status: 'incorrect',
            transcription: '= 8\\lim_{x\\to2}(f(x)-g(x))',
            bbox_px: { x: 100, y: 300, w: 500, h: 60 },
            explanation: 'You can’t factor 2 and 4 out together.',
            correction: '2(-3) - 4(4) = -22',
            concept: 'limit laws',
            later_steps_note: 'Later steps follow from this mistake.',
            cas_check: {
              kind: 'equivalent',
              variable: 'x',
              expression: '2*(-3) - 4*4',
              point: '',
              direction: 'both',
              lower: '',
              upper: '',
              conditions: '',
              student_result: '-56',
              corrected_result: '-22',
            },
          },
        ],
        notation_notes: [],
        final_answer_correct: false,
        attempted: true,
      },
      { label: '2c', transcription: '...', attempted: true, issues: [], notation_notes: [], final_answer_correct: true },
    ],
    overall_summary: 'Nice work on 2c. Review limit laws.',
    ...overrides,
  };
}

/** Builds a fake model reply; `text` is the JSON the model "returned". */
export function reply(
  text: string,
  extra: Partial<Pick<Anthropic.Beta.BetaMessage, 'stop_reason' | 'model'>> = {},
): Anthropic.Beta.BetaMessage {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: extra.model ?? 'claude-sonnet-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: extra.stop_reason ?? 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 3000, output_tokens: 2000 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

/** A ModelCall that returns the given replies in order and records each request. */
export function fakeCall(replies: Anthropic.Beta.BetaMessage[]) {
  const requests: Parameters<ModelCall>[0][] = [];
  const call: ModelCall = async (params, onText) => {
    requests.push(structuredClone(params));
    const next = replies.shift();
    if (!next) throw new Error('no more fake replies');
    const text = next.content.find((b) => b.type === 'text');
    if (text && text.type === 'text') onText(text.text);
    return next;
  };
  return { call, requests };
}
