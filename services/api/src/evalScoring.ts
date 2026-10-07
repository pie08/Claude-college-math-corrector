import type { GradeResult } from '@calc/shared';

/**
 * Answer keys and scoring for the eval harness.
 *
 * An answer-key file (`answers-<set>.md`) has a `### <image path>` heading per
 * page, followed by lines like `- 2a: wrong at line 1: ...`. The word after
 * the part label is the kind of entry. A part can have several entries
 * (e.g. `wrong` plus `notation`).
 */

export const ENTRY_KINDS = ['correct', 'wrong', 'incomplete', 'notation', 'excluded'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export type KeyEntry = { part: string; kind: EntryKind; text: string };
export type PageKey = { image: string; entries: KeyEntry[] };

export function parseAnswerKey(markdown: string): PageKey[] {
  const pages: PageKey[] = [];
  let current: PageKey | undefined;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^###\s+(\S+)/.exec(line);
    if (heading) {
      current = { image: heading[1]!, entries: [] };
      pages.push(current);
      continue;
    }
    const entry = /^-\s+([^:]+):\s*(\w+)\b(.*)$/.exec(line);
    if (current && entry) {
      const kind = entry[2]!.toLowerCase() as EntryKind;
      if (ENTRY_KINDS.includes(kind)) current.entries.push({ part: normalizeLabel(entry[1]!), kind, text: line });
    }
  }
  return pages;
}

/** "2(a)", "2 a", "2a." → "2a", so model labels match key labels. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export type PageScore = {
  image: string;
  /** Parts with a real error that the grader flagged. */
  caught: string[];
  /** Parts with a real error the grader missed. */
  missed: string[];
  /** Parts the key says are correct but the grader flagged. */
  falseFlags: string[];
  /** Flagged parts that aren't in the key at all (likely a labeling mismatch). */
  unmatched: string[];
  unclearCount: number;
  /** Notation entries in the key that the grader also noted. */
  notationNoted: string[];
  notationMissed: string[];
};

export function scorePage(key: PageKey, result: GradeResult): PageScore {
  const kinds = new Map<string, Set<EntryKind>>();
  for (const entry of key.entries) {
    if (!kinds.has(entry.part)) kinds.set(entry.part, new Set());
    kinds.get(entry.part)!.add(entry.kind);
  }
  const isExcluded = (part: string) => kinds.get(part)?.has('excluded') ?? false;
  const isError = (part: string) => {
    const k = kinds.get(part);
    return !!k && (k.has('wrong') || k.has('incomplete'));
  };

  const flagged = new Set<string>();
  const noted = new Set<string>();
  let unclearCount = 0;
  for (const problem of result.problems) {
    const part = normalizeLabel(problem.label);
    if (problem.issues.some((i) => i.status === 'incorrect')) flagged.add(part);
    unclearCount += problem.issues.filter((i) => i.status === 'unclear').length;
    if (problem.notation_notes.length > 0) noted.add(part);
  }

  const errorParts = [...kinds.keys()].filter(isError);
  const notationParts = [...kinds.keys()].filter((p) => kinds.get(p)!.has('notation'));
  const flaggedParts = [...flagged].filter((p) => !isExcluded(p));

  return {
    image: key.image,
    caught: errorParts.filter((p) => flagged.has(p)),
    missed: errorParts.filter((p) => !flagged.has(p)),
    falseFlags: flaggedParts.filter((p) => kinds.has(p) && !isError(p)),
    unmatched: flaggedParts.filter((p) => !kinds.has(p)),
    unclearCount,
    notationNoted: notationParts.filter((p) => noted.has(p)),
    notationMissed: notationParts.filter((p) => !noted.has(p)),
  };
}

export type Totals = {
  caught: number;
  missed: number;
  falseFlags: number;
  unmatched: number;
  /** Share of the grader's flags that were real errors (unmatched flags count against it). */
  precision: number;
  /** Share of real errors the grader caught. */
  recall: number;
};

export function totals(scores: PageScore[]): Totals {
  const sum = (pick: (s: PageScore) => unknown[]) => scores.reduce((n, s) => n + pick(s).length, 0);
  const caught = sum((s) => s.caught);
  const missed = sum((s) => s.missed);
  const falseFlags = sum((s) => s.falseFlags);
  const unmatched = sum((s) => s.unmatched);
  const flags = caught + falseFlags + unmatched;
  return {
    caught,
    missed,
    falseFlags,
    unmatched,
    precision: flags === 0 ? 1 : caught / flags,
    recall: caught + missed === 0 ? 1 : caught / (caught + missed),
  };
}
