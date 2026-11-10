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

/** Implementación en memoria para pruebas. */
export class InMemoryFollowerRepository implements FollowerRepository {
  readonly rows = new Map<string, Follower>();

  async upsertMany(followers: Follower[]): Promise<UpsertResult> {
    let inserted = 0;
    for (const f of followers) {
      if (!this.rows.has(f.username)) inserted++;
      this.rows.set(f.username, f);
    }
    return { inserted, updated: followers.length - inserted };
  }

  async findByUsernames(usernames: string[]): Promise<Follower[]> {
    return usernames.map((u) => this.rows.get(u)).filter((f): f is Follower => !!f);
  }

  async findPage(filter: FollowerFilter, page: number, pageSize: number, sort: FollowerSort): Promise<Page<Follower>> {
    const all = this.filtered(filter).sort(comparator(sort));
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
  }

  async findUsernames(filter: FollowerFilter): Promise<string[]> {
    return this.filtered(filter).sort(comparator('newest')).map((f) => f.username);
  }

  async setStatus(usernames: string[], status: FollowerStatus, removedAt: Date | null): Promise<void> {
    for (const u of usernames) {
      const f = this.rows.get(u);
      if (f) this.rows.set(u, { ...f, status, removedAt });
    }
  }

  async stats(): Promise<FollowerStats> {
    const all = [...this.rows.values()];
    const times = all.map((f) => f.followedAt.getTime());
    return {
      total: all.length,
      active: all.filter((f) => f.status === 'active').length,
      queued: all.filter((f) => f.status === 'queued').length,
      removed: all.filter((f) => f.status === 'removed').length,
      oldest: times.length ? new Date(Math.min(...times)) : null,
      newest: times.length ? new Date(Math.max(...times)) : null,
    };
  }

  async monthlyBreakdown(): Promise<MonthBucket[]> {
    const buckets = new Map<string, MonthBucket>();
    for (const f of this.rows.values()) {
      const d = f.followedAt;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const b = buckets.get(month) ?? { month, total: 0, active: 0 };
      b.total++;
      if (f.status === 'active') b.active++;
      buckets.set(month, b);
    }
    return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  private filtered(filter: FollowerFilter): Follower[] {
    const q = filter.search?.trim().toLowerCase();
    return [...this.rows.values()].filter(
      (f) =>
        (!filter.range || filter.range.contains(f.followedAt)) &&
        (!q || f.username.includes(q)) &&
        (!filter.status || filter.status === 'all' || f.status === filter.status),
    );
  }
}

function comparator(sort: FollowerSort): (a: Follower, b: Follower) => number {
  if (sort === 'username') return (a, b) => a.username.localeCompare(b.username);
  const dir = sort === 'newest' ? -1 : 1;
  return (a, b) => dir * (a.followedAt.getTime() - b.followedAt.getTime()) || a.username.localeCompare(b.username);
}
