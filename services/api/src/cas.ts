import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { repoRoot } from './config';
import type { CasCheck } from './modelOutput';

export type CasVerdict = 'verified' | 'disagrees' | 'not_checkable';
export type CasResult = { verdict: CasVerdict; detail: string };

/** Something that can double-check a correction. Swapped for a fake in tests. */
export type Checker = { check(claim: CasCheck): Promise<CasResult> };

/** Per-check limit: SymPy can run for a very long time on hard limits or integrals. */
const CHECK_TIMEOUT_MS = 4000;

/** Python from services/cas/.venv if present, else CAS_PYTHON, else python3/python. */
export function defaultPython(): string {
  if (process.env.CAS_PYTHON) return process.env.CAS_PYTHON;
  const venv = path.join(repoRoot, 'services/cas/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Runs services/cas/cas_worker.py as a long-lived child process and sends it
 * one check at a time over stdin/stdout. If a check times out, the worker is
 * killed and restarted for the next one. If Python isn't available, every
 * check reports not_checkable and grading carries on.
 */
export class CasWorker implements Checker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, (result: CasResult) => void>();
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private broken = false;

  constructor(private readonly python = defaultPython()) {}

  check(claim: CasCheck): Promise<CasResult> {
    if (claim.kind === 'none') return Promise.resolve({ verdict: 'not_checkable', detail: 'no checkable claim' });
    // One check at a time: the worker is single-threaded.
    const run = this.queue.then(() => this.send(claim));
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    this.child?.kill();
    this.child = null;
  }

  private start(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;
    if (this.broken) return null;
    const script = path.join(repoRoot, 'services/cas/cas_worker.py');
    try {
      const child = spawn(this.python, ['-I', script], { stdio: 'pipe' });
      child.on('error', () => {
        this.broken = true;
        this.failAll('Python checker unavailable');
      });
      child.on('exit', () => {
        if (this.child === child) this.child = null;
        this.failAll('checker stopped');
      });
      createInterface({ input: child.stdout }).on('line', (line) => {
        try {
          const msg = JSON.parse(line) as { id: number; verdict: CasVerdict; detail: string };
          this.pending.get(msg.id)?.({ verdict: msg.verdict, detail: msg.detail });
          this.pending.delete(msg.id);
        } catch {
          // Ignore anything that isn't a response line.
        }
      });
      this.child = child;
      return child;
    } catch {
      this.broken = true;
      return null;
    }
  }

  private send(claim: CasCheck): Promise<CasResult> {
    const child = this.start();
    if (!child) return Promise.resolve({ verdict: 'not_checkable', detail: 'Python checker unavailable' });
    const id = this.nextId++;
    return new Promise<CasResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        child.kill(); // a fresh worker starts on the next check
        resolve({ verdict: 'not_checkable', detail: 'timed out' });
      }, CHECK_TIMEOUT_MS);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      child.stdin.write(JSON.stringify({ id, ...claim }) + '\n');
    });
  }

  private failAll(detail: string) {
    for (const resolve of this.pending.values()) resolve({ verdict: 'not_checkable', detail });
    this.pending.clear();
  }
}
