import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'calculus-tutor.db';

/**
 * Schema migrations, applied in order. Never edit a shipped migration; add a
 * new one. `PRAGMA user_version` records how many have run.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE scans (
    id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL,
    image_path TEXT NOT NULL,          -- relative to the app's document directory
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    page_status TEXT NOT NULL,
    mistakes INTEGER NOT NULL,
    unclear INTEGER NOT NULL,
    summary TEXT NOT NULL,
    result_json TEXT NOT NULL          -- the full GradeResult
  );
  CREATE INDEX scans_created ON scans (created_at DESC);

  CREATE TABLE corrections (
    id TEXT PRIMARY KEY NOT NULL,      -- "<scan id>:<issue id>"
    scan_id TEXT NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
    mark_number INTEGER NOT NULL,
    problem_label TEXT NOT NULL,
    concept TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    reviewed INTEGER NOT NULL DEFAULT 0,
    issue_json TEXT NOT NULL
  );
  CREATE INDEX corrections_scan ON corrections (scan_id);
  CREATE INDEX corrections_created ON corrections (created_at DESC);
  `,
];

/** Runs on app start (SQLiteProvider onInit): brings the schema up to date. */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]!);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
