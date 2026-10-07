/**
 * Works out one problem on a page from the command line.
 *
 *   npm run tutor -- <image> --label 2a [--statement "LaTeX"] [--mistake "what went wrong"] [--unit "Limits"]
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import Anthropic from '@anthropic-ai/sdk';

import { CasWorker } from '../src/cas';
import { loadEnv, serverConfig } from '../src/config';
import { claudeModelCall } from '../src/grader';
import { prepareImage } from '../src/image';
import { solveProblem, TutorModelSchema } from '../src/tutor';
import { userPath } from './lib/common';

loadEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { label: { type: 'string' }, statement: { type: 'string' }, mistake: { type: 'string', multiple: true }, unit: { type: 'string' } },
});
if (positionals.length !== 1 || !values.label) {
  console.error('usage: npm run tutor -- <image> --label 2a [--statement "..."] [--mistake "..."] [--unit "..."]');
  process.exit(1);
}

const config = serverConfig();
const call = claudeModelCall(new Anthropic(), config, { schema: TutorModelSchema, effort: config.tutorEffort });
const checker = new CasWorker();
try {
  const image = await prepareImage(await readFile(userPath(positionals[0]!)), config.maxImageEdge);
  const mistakes = (values.mistake ?? []).map((explanation) => ({ transcription: '', correction: null, explanation }));
  const result = await solveProblem(image, { label: values.label, statement: values.statement ?? '', mistakes }, { unit: values.unit }, { call, config, checker });
  console.log(`[${result.label}] solvable: ${result.solvable}; off track at step: ${result.off_track_step}`);
  console.log(result.intro);
  result.steps.forEach((s, i) => console.log(`  ${i}. ${s.title}\n     ${s.math}\n     ${s.explanation}`));
  console.log(`answer: ${result.final_answer}  [${result.verification}]`);
  const m = result.meta;
  console.log(`${m.model}, effort ${config.tutorEffort}, ${(m.latency_ms / 1000).toFixed(1)}s, ${m.input_tokens} in / ${m.output_tokens} out, $${m.cost_usd.toFixed(4)}`);
} finally {
  checker.close();
}
