import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/adapters/outbound/persistence/sqlite/database.js';
import { SqliteFollowerRepository } from '../src/adapters/outbound/persistence/sqlite/sqlite-follower-repository.js';
import { SqliteRemovalQueueRepository } from '../src/adapters/outbound/persistence/sqlite/sqlite-removal-queue-repository.js';
import { createFollower } from '../src/domain/follower.js';
import { DateRange } from '../src/domain/date-range.js';

describe('Repositorios SQLite', () => {
  it('upsert, filtro por rango/búsqueda, estadísticas y meses', async () => {
    const db = openDatabase(':memory:');
    const repo = new SqliteFollowerRepository(db);
    const r1 = await repo.upsertMany([
      createFollower({ username: 'ana', followedAt: new Date('2025-01-15T10:00:00') }),
      createFollower({ username: 'bob', followedAt: new Date('2025-03-02T10:00:00') }),
    ]);
    expect(r1).toEqual({ inserted: 2, updated: 0 });
    const r2 = await repo.upsertMany([createFollower({ username: 'ana', followedAt: new Date('2025-01-16T10:00:00') })]);
    expect(r2).toEqual({ inserted: 0, updated: 1 });

    const page = await repo.findPage({ range: DateRange.create(new Date('2025-02-01'), null), search: 'b' }, 1, 10, 'newest');
    expect(page.total).toBe(1);
    expect(page.items[0].username).toBe('bob');

    await repo.setStatus(['bob'], 'removed', new Date());
    const stats = await repo.stats();
    expect(stats).toMatchObject({ total: 2, active: 1, removed: 1, queued: 0 });
    const months = await repo.monthlyBreakdown();
    expect(months.map((m) => m.month)).toEqual(['2025-01', '2025-03']);
    expect(months[1]).toMatchObject({ total: 1, active: 0 });
  });

  it('cola: enqueue, claim atómico, save, counts, delete', async () => {
    const db = openDatabase(':memory:');
    const queue = new SqliteRemovalQueueRepository(db);
    const now = new Date();
    const jobs = await queue.enqueue(['a', 'b'], now);
    expect(jobs.map((j) => j.username)).toEqual(['a', 'b']);
    expect(await queue.findOpenUsernames(['a', 'zzz'])).toEqual(['a']);

    const first = await queue.claimNext(now);
    expect(first?.username).toBe('a');
    expect(first?.status).toBe('processing');
    expect((await queue.claimNext(now))?.username).toBe('b');
    expect(await queue.claimNext(now)).toBeNull();

    await queue.save({ ...first!, status: 'done', attempts: 1, updatedAt: now });
    expect(await queue.counts()).toMatchObject({ done: 1, processing: 1, pending: 0 });
    expect(await queue.deleteByIds([first!.id])).toBe(1);
    expect((await queue.list()).length).toBe(1);
  });
});
