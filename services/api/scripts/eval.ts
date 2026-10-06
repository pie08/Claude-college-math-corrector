/**
 * Grades every page that has an answer key and scores the results.
 *
 *   npm run eval -- [--set exam1] [--efforts low,medium,high] [--runs 1] [--concurrency 3] [--model id]
 *
 * Answer keys: services/api/test/fixtures/pages/answers-<set>.md (format in answers.md).
 * Output: services/api/out/eval/<timestamp>/ with each result's JSON, an
 * annotated image, and report.md.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import type { GradeResult } from '@calc/shared';

import { loadEnv } from '../src/config';
import { parseAnswerKey, scorePage, totals, type PageKey, type PageScore } from '../src/evalScoring';
import { fixturesDir, makeGrader, outDir, parseEffort, pool, timestamp } from './lib/common';

loadEnv();

const { values } = parseArgs({
  options: {
    set: { type: 'string' },
    efforts: { type: 'string', default: 'low,medium,high' },
    runs: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '3' },
    model: { type: 'string' },
  },
});

const keyFiles = (await readdir(fixturesDir)).filter((n) => /^answers-.+\.md$/.test(n));
const sets = keyFiles
  .map((file) => ({ name: file.slice('answers-'.length, -'.md'.length), file }))
  .filter((s) => !values.set || s.name === values.set);
if (sets.length === 0) throw new Error(`No answer keys found${values.set ? ` for set "${values.set}"` : ''} in ${fixturesDir}`);

const pages: { set: string; key: PageKey }[] = [];
for (const s of sets) {
  for (const key of parseAnswerKey(await readFile(path.join(fixturesDir, s.file), 'utf8'))) {
    // Pages where every entry is excluded have nothing to score.
    if (key.entries.some((e) => e.kind !== 'excluded')) pages.push({ set: s.name, key });
  }
}

const efforts = values.efforts.split(',').map((e) => parseEffort(e.trim()));
const runs = Number(values.runs);
const runDir = path.join(outDir, 'eval', timestamp());

type Row = { effort: string; run: number; page: string; score?: PageScore; result?: GradeResult; error?: string };
const rows: Row[] = [];

for (const effort of efforts) {
  const grader = makeGrader({ effort, ...(values.model ? { model: values.model } : {}) });
  for (let run = 1; run <= runs; run++) {
    console.log(`\n${grader.config.model} effort=${effort} run ${run}: ${pages.length} pages`);
    const done = await pool(
      Number(values.concurrency),
      pages.map(({ set, key }) => async (): Promise<Row> => {
        const name = `${set}-${path.parse(key.image).name}`;
        const saveAs = path.join(runDir, `${effort}-run${run}`, name);
        try {
          const result = await grader.grade(path.join(fixturesDir, key.image), saveAs);
          const score = scorePage(key, result);
          console.log(
            `  ${name}: caught ${score.caught.length}, missed ${score.missed.length}, false ${score.falseFlags.length}, unmatched ${score.unmatched.length} (${(result.meta.latency_ms / 1000).toFixed(1)}s)`,
          );
          return { effort, run, page: name, score, result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`  ${name}: FAILED ${message}`);
          return { effort, run, page: name, error: message };
        }
      }),
    );
    rows.push(...done);
  }
}

await writeFile(path.join(runDir, 'report.md'), report(rows));
console.log(`\n${report(rows)}\nSaved to ${runDir}`);

function report(all: Row[]): string {
  const out = ['# Eval report', '', '| effort | precision | recall | caught | missed | false flags | unmatched | failures | p50 s | p95 s | avg $/page | total $ |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const effort of efforts) {
    const mine = all.filter((r) => r.effort === effort);
    const scored = mine.filter((r) => r.score).map((r) => r.score!);
    const t = totals(scored);
    const latencies = mine.filter((r) => r.result).map((r) => r.result!.meta.latency_ms / 1000).sort((a, b) => a - b);
    const costs = mine.filter((r) => r.result).map((r) => r.result!.meta.cost_usd);
    const total = costs.reduce((a, b) => a + b, 0);
    out.push(
      `| ${effort} | ${pct(t.precision)} | ${pct(t.recall)} | ${t.caught} | ${t.missed} | ${t.falseFlags} | ${t.unmatched} | ${mine.length - scored.length} | ${quantile(latencies, 0.5)} | ${quantile(latencies, 0.95)} | ${costs.length ? (total / costs.length).toFixed(3) : '-'} | ${total.toFixed(3)} |`,
    );
  }
  out.push('', '## Per page', '');
  for (const r of all) {
    if (r.error) {
      out.push(`- **${r.effort} run${r.run} ${r.page}**: FAILED: ${r.error}`);
      continue;
    }
    const s = r.score!;
    const list = (xs: string[]) => (xs.length ? xs.join(', ') : '-');
    out.push(
      `- **${r.effort} run${r.run} ${r.page}**: caught ${list(s.caught)}; missed ${list(s.missed)}; false flags ${list(s.falseFlags)}; unmatched ${list(s.unmatched)}; unclear ${s.unclearCount}; notation noted ${list(s.notationNoted)}, missed ${list(s.notationMissed)}`,
    );
  }
  return out.join('\n') + '\n';
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function quantile(sorted: number[], q: number): string {
  if (sorted.length === 0) return '-';
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!.toFixed(1);
}
