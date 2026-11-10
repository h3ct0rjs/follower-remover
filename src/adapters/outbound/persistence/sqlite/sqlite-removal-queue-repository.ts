import type { DatabaseSync } from 'node:sqlite';
import { REMOVAL_JOB_STATUSES, type RemovalJob, type RemovalJobStatus } from '../../../../domain/removal-job.js';
import type { QueueCounts, RemovalQueueRepository } from '../../../../domain/ports/removal-queue-repository.js';
import { chunk, inTransaction, placeholders } from './database.js';

interface Row {
  id: number;
  username: string;
  status: RemovalJobStatus;
  attempts: number;
  last_error: string | null;
  instagram_user_id: string | null;
  created_at: number;
  updated_at: number;
}

const toJob = (r: Row): RemovalJob => ({
  id: r.id,
  username: r.username,
  status: r.status,
  attempts: r.attempts,
  lastError: r.last_error,
  instagramUserId: r.instagram_user_id,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

export class SqliteRemovalQueueRepository implements RemovalQueueRepository {
  constructor(private readonly db: DatabaseSync) {}

  async enqueue(usernames: string[], now: Date): Promise<RemovalJob[]> {
    const insert = this.db.prepare(
      `INSERT INTO removal_jobs (username, status, attempts, created_at, updated_at) VALUES (?, 'pending', 0, ?, ?)`,
    );
    const ids = inTransaction(this.db, () =>
      usernames.map((u) => Number(insert.run(u, now.getTime(), now.getTime()).lastInsertRowid)),
    );
    return this.findByIds(ids);
  }

  async findOpenUsernames(usernames: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const part of chunk(usernames)) {
      const rows = this.db
        .prepare(
          `SELECT DISTINCT username FROM removal_jobs
           WHERE status IN ('pending','processing','failed') AND username IN (${placeholders(part.length)})`,
        )
        .all(...part) as unknown as { username: string }[];
      out.push(...rows.map((r) => r.username));
    }
    return out;
  }

  async claimNext(now: Date): Promise<RemovalJob | null> {
    return inTransaction(this.db, () => {
      const row = this.db
        .prepare(`SELECT * FROM removal_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1`)
        .get() as Row | undefined;
      if (!row) return null;
      this.db.prepare(`UPDATE removal_jobs SET status = 'processing', updated_at = ? WHERE id = ?`).run(now.getTime(), row.id);
      return toJob({ ...row, status: 'processing', updated_at: now.getTime() });
    });
  }

  async findById(id: number): Promise<RemovalJob | null> {
    const row = this.db.prepare('SELECT * FROM removal_jobs WHERE id = ?').get(id) as Row | undefined;
    return row ? toJob(row) : null;
  }

  async findByStatus(status: RemovalJobStatus): Promise<RemovalJob[]> {
    const rows = this.db.prepare('SELECT * FROM removal_jobs WHERE status = ? ORDER BY id ASC').all(status) as unknown as Row[];
    return rows.map(toJob);
  }

  async save(job: RemovalJob): Promise<void> {
    this.db
      .prepare(
        `UPDATE removal_jobs SET status = ?, attempts = ?, last_error = ?, instagram_user_id = ?, updated_at = ? WHERE id = ?`,
      )
      .run(job.status, job.attempts, job.lastError, job.instagramUserId, job.updatedAt.getTime(), job.id);
  }

  async saveMany(jobs: RemovalJob[]): Promise<void> {
    inTransaction(this.db, () => {
      for (const j of jobs) void this.save(j);
    });
  }

  async list(status: RemovalJobStatus | 'all' = 'all'): Promise<RemovalJob[]> {
    const rows = (
      status === 'all'
        ? this.db.prepare('SELECT * FROM removal_jobs ORDER BY id DESC').all()
        : this.db.prepare('SELECT * FROM removal_jobs WHERE status = ? ORDER BY id DESC').all(status)
    ) as unknown as Row[];
    return rows.map(toJob);
  }

  async deleteByIds(ids: number[]): Promise<number> {
    let deleted = 0;
    inTransaction(this.db, () => {
      for (const part of chunk(ids)) {
        deleted += Number(this.db.prepare(`DELETE FROM removal_jobs WHERE id IN (${placeholders(part.length)})`).run(...part).changes);
      }
    });
    return deleted;
  }

  async counts(): Promise<QueueCounts> {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM removal_jobs GROUP BY status').all() as unknown as { status: RemovalJobStatus; n: number }[];
    const counts = Object.fromEntries(REMOVAL_JOB_STATUSES.map((s) => [s, 0])) as QueueCounts;
    for (const r of rows) counts[r.status] = r.n;
    return counts;
  }

  private async findByIds(ids: number[]): Promise<RemovalJob[]> {
    const out: RemovalJob[] = [];
    for (const part of chunk(ids)) {
      const rows = this.db.prepare(`SELECT * FROM removal_jobs WHERE id IN (${placeholders(part.length)}) ORDER BY id`).all(...part) as unknown as Row[];
      out.push(...rows.map(toJob));
    }
    return out;
  }
}
