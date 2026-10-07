import type { GradeResult } from '@calc/shared';

export type GradedScan = {
  id: string;
  imageUri: string;
  /** Size of the uploaded image (the result's boxes are fractions of it). */
  width: number;
  height: number;
  result: GradeResult;
  createdAt: number;
};

/**
 * Results of this app session, kept in memory so the results screen can be
 * opened by id. Phase 4 replaces this with SQLite so history survives restarts.
 */
const scans = new Map<string, GradedScan>();

export function saveScan(scan: Omit<GradedScan, 'id' | 'createdAt'>): GradedScan {
  const saved: GradedScan = { ...scan, id: Date.now().toString(36), createdAt: Date.now() };
  scans.set(saved.id, saved);
  return saved;
}

export function getScan(id: string): GradedScan | undefined {
  return scans.get(id);
}
