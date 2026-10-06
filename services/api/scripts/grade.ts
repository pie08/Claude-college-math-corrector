/**
 * Grade photos from the command line and save annotated copies.
 *
 *   npm run grade -- <image or folder>... [--effort high] [--model claude-sonnet-5-5] [--unit "Limits"]
 *
 * Results go to services/api/out/grade/<timestamp>/: <name>.json and <name>.jpg
 * (the page with the grader's boxes drawn on it).
 */
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadEnv } from '../src/config';
import { describeResult } from './lib/annotate';
import { imageFiles, makeGrader, outDir, parseEffort, timestamp } from './lib/common';

loadEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { effort: { type: 'string' }, model: { type: 'string' }, unit: { type: 'string' } },
});
if (positionals.length === 0) {
  console.error('usage: npm run grade -- <image or folder>... [--effort low|medium|high] [--model id] [--unit "name"]');
  process.exit(1);
}

const grader = makeGrader({
  ...(values.effort ? { effort: parseEffort(values.effort) } : {}),
  ...(values.model ? { model: values.model } : {}),
});
const runDir = path.join(outDir, 'grade', timestamp());
const files = await imageFiles(positionals);
let totalCost = 0;

for (const file of files) {
  const name = path.parse(file).name;
  console.log(`\n=== ${path.basename(file)}`);
  try {
    const result = await grader.grade(file, path.join(runDir, name), {
      unit: values.unit,
      onProgress: (p) => process.stdout.write(`  ${p.stage}${p.problems_found ? ` (${p.problems_found} problems)` : ''}\r`),
    });
    process.stdout.write(' '.repeat(60) + '\r');
    console.log(describeResult(result));
    totalCost += result.meta.cost_usd;
  } catch (error) {
    console.log(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nSaved to ${runDir}`);
console.log(`Total estimated cost: $${totalCost.toFixed(4)}`);
