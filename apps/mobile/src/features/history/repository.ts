import { GradeResultSchema, type GradeResult } from '@calc/shared';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { correctionRowsFor, countMarks, type Mark } from './rows';

/**
 * Saved scans and corrections. Photos are copied into the app's document
 * directory (the cache can be cleared by the system) and referenced by a
 * relative path, since the absolute app directory can change between installs.
 */

export type GradedScan = {
  id: string;
  createdAt: number;
  imageUri: string;
  width: number;
  height: number;
  result: GradeResult;
};

export type ScanSummary = {
  id: string;
  createdAt: number;
  imageUri: string;
  pageStatus: string;
  mistakes: number;
  unclear: number;
  summary: string;
};

export type SavedCorrection = {
  id: string;
  scanId: string;
  createdAt: number;
  reviewed: boolean;
  mark: Mark;
};

const SCANS_DIR = 'scans';

function imageFile(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

export async function saveScan(
  db: SQLiteDatabase,
  scan: { imageUri: string; width: number; height: number; result: GradeResult },
): Promise<string> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = Date.now();

  const dir = new Directory(Paths.document, SCANS_DIR);
  dir.create({ intermediates: true, idempotent: true });
  const relativePath = `${SCANS_DIR}/${id}.jpg`;
  await new File(scan.imageUri).copy(imageFile(relativePath));

  const { mistakes, unclear } = countMarks(scan.result);
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO scans (id, created_at, image_path, width, height, page_status, mistakes, unclear, summary, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, createdAt, relativePath, scan.width, scan.height, scan.result.page_status,
        mistakes, unclear, scan.result.overall_summary, JSON.stringify(scan.result),
      );
      for (const row of correctionRowsFor(id, createdAt, scan.result)) {
        await db.runAsync(
          `INSERT INTO corrections (id, scan_id, mark_number, problem_label, concept, created_at, issue_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          row.id, row.scan_id, row.mark_number, row.problem_label, row.concept, row.created_at, row.issue_json,
        );
      }
    });
  } catch (error) {
    // Don't leave an orphaned photo behind.
    deleteQuietly(imageFile(relativePath));
    throw error;
  }
  return id;
}

export async function getScan(db: SQLiteDatabase, id: string): Promise<GradedScan | null> {
  const row = await db.getFirstAsync<{
    id: string; created_at: number; image_path: string; width: number; height: number; result_json: string;
  }>('SELECT id, created_at, image_path, width, height, result_json FROM scans WHERE id = ?', id);
  if (!row) return null;
  const parsed = GradeResultSchema.safeParse(JSON.parse(row.result_json));
  if (!parsed.success) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    imageUri: imageFile(row.image_path).uri,
    width: row.width,
    height: row.height,
    result: parsed.data,
  };
}

export async function listScans(db: SQLiteDatabase): Promise<ScanSummary[]> {
  const rows = await db.getAllAsync<{
    id: string; created_at: number; image_path: string; page_status: string; mistakes: number; unclear: number; summary: string;
  }>('SELECT id, created_at, image_path, page_status, mistakes, unclear, summary FROM scans ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    imageUri: imageFile(r.image_path).uri,
    pageStatus: r.page_status,
    mistakes: r.mistakes,
    unclear: r.unclear,
    summary: r.summary,
  }));
}

export async function listCorrections(db: SQLiteDatabase): Promise<SavedCorrection[]> {
  const rows = await db.getAllAsync<{ id: string; scan_id: string; created_at: number; reviewed: number; issue_json: string }>(
    'SELECT id, scan_id, created_at, reviewed, issue_json FROM corrections ORDER BY created_at DESC, mark_number ASC',
  );
  return rows.map((r) => ({
    id: r.id,
    scanId: r.scan_id,
    createdAt: r.created_at,
    reviewed: r.reviewed === 1,
    mark: JSON.parse(r.issue_json) as Mark,
  }));
}

export async function setReviewed(db: SQLiteDatabase, correctionId: string, reviewed: boolean): Promise<void> {
  await db.runAsync('UPDATE corrections SET reviewed = ? WHERE id = ?', reviewed ? 1 : 0, correctionId);
}

/** Deletes a scan, its corrections (cascade) and its photo. */
export async function deleteScan(db: SQLiteDatabase, id: string): Promise<void> {
  const row = await db.getFirstAsync<{ image_path: string }>('SELECT image_path FROM scans WHERE id = ?', id);
  await db.runAsync('DELETE FROM scans WHERE id = ?', id);
  if (row) deleteQuietly(imageFile(row.image_path));
}

function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Best effort: a leftover file is harmless.
  }
}
