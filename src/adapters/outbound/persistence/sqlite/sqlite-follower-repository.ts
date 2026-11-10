import type { DatabaseSync } from 'node:sqlite';
import type { Follower, FollowerStatus } from '../../../../domain/follower.js';
import type {
  FollowerFilter,
  FollowerRepository,
  FollowerSort,
  FollowerStats,
  MonthBucket,
  Page,
  UpsertResult,
} from '../../../../domain/ports/follower-repository.js';
import { chunk, inTransaction, placeholders } from './database.js';

interface Row {
  username: string;
  profile_url: string;
  followed_at: number;
  status: FollowerStatus;
  removed_at: number | null;
}

const toFollower = (r: Row): Follower => ({
  username: r.username,
  profileUrl: r.profile_url,
  followedAt: new Date(r.followed_at),
  status: r.status,
  removedAt: r.removed_at === null ? null : new Date(r.removed_at),
});

const ORDER: Record<FollowerSort, string> = {
  newest: 'followed_at DESC, username ASC',
  oldest: 'followed_at ASC, username ASC',
  username: 'username ASC',
};

export class SqliteFollowerRepository implements FollowerRepository {
  constructor(private readonly db: DatabaseSync) {}

  async upsertMany(followers: Follower[]): Promise<UpsertResult> {
    if (!followers.length) return { inserted: 0, updated: 0 };
    const stmt = this.db.prepare(`
      INSERT INTO followers (username, profile_url, followed_at, status, removed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        profile_url = excluded.profile_url,
        followed_at = excluded.followed_at,
        status      = excluded.status,
        removed_at  = excluded.removed_at
    `);
    return inTransaction(this.db, () => {
      const before = this.count();
      for (const f of followers) {
        stmt.run(f.username, f.profileUrl, f.followedAt.getTime(), f.status, f.removedAt?.getTime() ?? null);
      }
      const inserted = this.count() - before;
      return { inserted, updated: followers.length - inserted };
    });
  }

  async findByUsernames(usernames: string[]): Promise<Follower[]> {
    const out: Follower[] = [];
    for (const part of chunk(usernames)) {
      const rows = this.db
        .prepare(`SELECT * FROM followers WHERE username IN (${placeholders(part.length)})`)
        .all(...part) as unknown as Row[];
      out.push(...rows.map(toFollower));
    }
    return out;
  }

  async findPage(filter: FollowerFilter, page: number, pageSize: number, sort: FollowerSort): Promise<Page<Follower>> {
    const { where, params } = this.where(filter);
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM followers ${where}`).get(...params) as { n: number }).n;
    const rows = this.db
      .prepare(`SELECT * FROM followers ${where} ORDER BY ${ORDER[sort]} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as Row[];
    return { items: rows.map(toFollower), total, page, pageSize };
  }

  async findUsernames(filter: FollowerFilter): Promise<string[]> {
    const { where, params } = this.where(filter);
    const rows = this.db.prepare(`SELECT username FROM followers ${where} ORDER BY followed_at DESC`).all(...params) as unknown as { username: string }[];
    return rows.map((r) => r.username);
  }

  async setStatus(usernames: string[], status: FollowerStatus, removedAt: Date | null): Promise<void> {
    if (!usernames.length) return;
    inTransaction(this.db, () => {
      for (const part of chunk(usernames)) {
        this.db
          .prepare(`UPDATE followers SET status = ?, removed_at = ? WHERE username IN (${placeholders(part.length)})`)
          .run(status, removedAt?.getTime() ?? null, ...part);
      }
    });
  }

  async stats(): Promise<FollowerStats> {
    const r = this.db
      .prepare(`
        SELECT COUNT(*) AS total,
               SUM(status = 'active')  AS active,
               SUM(status = 'queued')  AS queued,
               SUM(status = 'removed') AS removed,
               MIN(followed_at) AS oldest,
               MAX(followed_at) AS newest
        FROM followers`)
      .get() as { total: number; active: number | null; queued: number | null; removed: number | null; oldest: number | null; newest: number | null };
    return {
      total: r.total,
      active: r.active ?? 0,
      queued: r.queued ?? 0,
      removed: r.removed ?? 0,
      oldest: r.oldest === null ? null : new Date(r.oldest),
      newest: r.newest === null ? null : new Date(r.newest),
    };
  }

  async monthlyBreakdown(): Promise<MonthBucket[]> {
    const rows = this.db
      .prepare(`
        SELECT strftime('%Y-%m', followed_at / 1000, 'unixepoch', 'localtime') AS month,
               COUNT(*) AS total,
               SUM(status = 'active') AS active
        FROM followers GROUP BY month ORDER BY month ASC`)
      .all() as unknown as { month: string; total: number; active: number | null }[];
    return rows.map((r) => ({ month: r.month, total: r.total, active: r.active ?? 0 }));
  }

  private count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM followers').get() as { n: number }).n;
  }

  private where(filter: FollowerFilter): { where: string; params: (string | number)[] } {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (filter.range?.from) {
      clauses.push('followed_at >= ?');
      params.push(filter.range.from.getTime());
    }
    if (filter.range?.to) {
      clauses.push('followed_at <= ?');
      params.push(filter.range.to.getTime());
    }
    if (filter.search?.trim()) {
      clauses.push("username LIKE ? ESCAPE '\\'");
      params.push(`%${filter.search.trim().toLowerCase().replace(/[%_\\]/g, '\\$&')}%`);
    }
    if (filter.status && filter.status !== 'all') {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }
}
