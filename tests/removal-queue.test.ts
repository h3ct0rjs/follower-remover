import { describe, expect, it } from 'vitest';
import { DateRange } from '../src/domain/date-range.js';
import { exportDoc, harness } from './helpers.js';

const DAY = 86400;
const base = 1_750_000_000; // junio 2025

async function seeded() {
  const h = harness();
  await h.uc.importFollowers.execute([
    exportDoc([
      { username: 'viejo', timestamp: base - 400 * DAY },
      { username: 'medio', timestamp: base - 100 * DAY },
      { username: 'nuevo', timestamp: base - 1 * DAY },
    ]),
  ]);
  return h;
}

describe('Filtrar por fechas y encolar', () => {
  it('filtra seguidores por rango de fechas', async () => {
    const { uc } = await seeded();
    const range = DateRange.create(new Date((base - 200 * DAY) * 1000), new Date((base - 50 * DAY) * 1000));
    const page = await uc.listFollowers.execute({ filter: { range } });
    expect(page.items.map((f) => f.username)).toEqual(['medio']);
  });

  it('rechaza rangos invertidos', () => {
    expect(() => DateRange.create(new Date('2026-01-02'), new Date('2026-01-01'))).toThrow();
  });

  it('encola seleccionados, omite desconocidos y repetidos, y marca al seguidor como queued', async () => {
    const { uc, followers } = await seeded();
    const r = await uc.enqueueRemovals.execute(['viejo', '@Medio', 'fantasma', 'viejo']);
    expect(r.queued).toEqual(['viejo', 'medio']);
    expect(r.skipped.unknown).toEqual(['fantasma']);
    expect((await followers.findByUsernames(['viejo']))[0].status).toBe('queued');

    const again = await uc.enqueueRemovals.execute(['viejo']);
    expect(again.skipped.alreadyQueued).toEqual(['viejo']);
  });
});

describe('Ciclo de vida de un trabajo', () => {
  it('claim → removed marca al seguidor como eliminado', async () => {
    const { uc, followers } = await seeded();
    await uc.enqueueRemovals.execute(['viejo']);
    const job = (await uc.claimNextRemoval.execute())!;
    expect(job.status).toBe('processing');
    expect(await uc.claimNextRemoval.execute()).toBeNull();

    const done = await uc.reportRemovalResult.execute(job.id, { outcome: 'removed', instagramUserId: '42' });
    expect(done.status).toBe('done');
    expect(done.instagramUserId).toBe('42');
    const [f] = await followers.findByUsernames(['viejo']);
    expect(f.status).toBe('removed');
    expect(f.removedAt).not.toBeNull();
  });

  it('un fallo deja el trabajo reintentable y el seguidor sigue en cola', async () => {
    const { uc, followers } = await seeded();
    await uc.enqueueRemovals.execute(['viejo']);
    const job = (await uc.claimNextRemoval.execute())!;
    const failed = await uc.reportRemovalResult.execute(job.id, { outcome: 'failed', error: 'HTTP 500' });
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(1);
    expect((await followers.findByUsernames(['viejo']))[0].status).toBe('queued');

    expect(await uc.manageQueue.retryFailed()).toBe(1);
    expect((await uc.claimNextRemoval.execute())?.id).toBe(job.id);
  });

  it('cancelar devuelve al seguidor a activo; no se puede cancelar un trabajo hecho', async () => {
    const { uc, followers } = await seeded();
    await uc.enqueueRemovals.execute(['viejo', 'medio']);
    const jobs = await uc.manageQueue.list('pending');
    await uc.manageQueue.cancel(jobs[1].id);
    expect((await followers.findByUsernames([jobs[1].username]))[0].status).toBe('active');

    const claimed = (await uc.claimNextRemoval.execute())!;
    await uc.reportRemovalResult.execute(claimed.id, { outcome: 'already_not_following' });
    await expect(uc.manageQueue.cancel(claimed.id)).rejects.toThrow(/No se puede pasar/);
  });

  it('libera trabajos atascados en processing al reclamar de nuevo', async () => {
    const { uc, clock } = await seeded();
    await uc.enqueueRemovals.execute(['viejo']);
    const job = (await uc.claimNextRemoval.execute())!;
    clock.advance(16 * 60 * 1000);
    const reclaimed = await uc.claimNextRemoval.execute();
    expect(reclaimed?.id).toBe(job.id);
  });

  it('limpiar terminados devuelve a activo a los fallidos', async () => {
    const { uc, followers, queue } = await seeded();
    await uc.enqueueRemovals.execute(['viejo']);
    const job = (await uc.claimNextRemoval.execute())!;
    await uc.reportRemovalResult.execute(job.id, { outcome: 'failed', error: 'x' });
    expect(await uc.manageQueue.clearFinished()).toBe(1);
    expect((await followers.findByUsernames(['viejo']))[0].status).toBe('active');
    expect((await queue.counts()).failed).toBe(0);
  });
});
