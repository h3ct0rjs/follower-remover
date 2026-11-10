import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS followers (
  username      TEXT PRIMARY KEY,
  profile_url   TEXT NOT NULL,
  followed_at   INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','queued','removed')),
  removed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_followers_followed_at ON followers (followed_at);
CREATE INDEX IF NOT EXISTS idx_followers_status ON followers (status);

CREATE TABLE IF NOT EXISTS removal_jobs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  username           TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed','cancelled')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT,
  instagram_user_id  TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON removal_jobs (status, id);
CREATE INDEX IF NOT EXISTS idx_jobs_username ON removal_jobs (username);
`;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** SQLite limita el número de parámetros por sentencia; troceamos listas grandes. */
export function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const placeholders = (n: number): string => Array(n).fill('?').join(',');
