import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import type { GradeResult } from '@calc/shared';

import { CasWorker } from '../../src/cas';
import { EFFORTS, graderConfig, repoRoot, type Effort, type GraderConfig } from '../../src/config';
import { claudeModelCall, gradePage, type Progress } from '../../src/grader';
import { prepareImage } from '../../src/image';
import { annotate } from './annotate';

export const fixturesDir = path.join(repoRoot, 'services/api/test/fixtures/pages');
export const outDir = path.join(repoRoot, 'services/api/out');

const IMAGE_EXT = /\.(jpe?g|png|webp|heic)$/i;

/** Resolves a CLI path against where the user ran npm (npm runs scripts inside the workspace). */
export function userPath(p: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

/** Expands files and directories into a sorted list of image files. */
export async function imageFiles(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const full = userPath(input);
    if ((await stat(full)).isDirectory()) {
      const names = (await readdir(full)).filter((n) => IMAGE_EXT.test(n)).sort();
      files.push(...names.map((n) => path.join(full, n)));
    } else {
      files.push(full);
    }
  }
  return files;
}

export function parseEffort(value: string): Effort {
  if (!EFFORTS.includes(value as Effort)) throw new Error(`effort must be one of ${EFFORTS.join(', ')}`);
  return value as Effort;
}

export function makeGrader(overrides: Partial<GraderConfig>) {
  const config = { ...graderConfig(), ...overrides };
  const call = claudeModelCall(new Anthropic(), config);
  const checker = new CasWorker();
  return {
    config,
    /** Stops the SymPy worker so the script can exit. */
    close: () => checker.close(),
    /** Grades one image file; saves the JSON and an annotated copy under `saveAs` (no extension). */
    async grade(file: string, saveAs: string, opts: { unit?: string; onProgress?: (p: Progress) => void } = {}) {
      const image = await prepareImage(await readFile(file), config.maxImageEdge);
      const result: GradeResult = await gradePage(image, { unit: opts.unit }, { call, config, checker }, opts.onProgress);
      await mkdir(path.dirname(saveAs), { recursive: true });
      await writeFile(`${saveAs}.json`, JSON.stringify(result, null, 2));
      await writeFile(`${saveAs}.jpg`, await annotate(image.base64, result));
      return result;
    },
  };
}

/** Runs `tasks` with at most `limit` in flight. */
export async function pool<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  });
  await Promise.all(workers);
  return results;
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
