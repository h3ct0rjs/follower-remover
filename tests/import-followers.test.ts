import { describe, expect, it } from 'vitest';
import { exportDoc, harness } from './helpers.js';

describe('ImportFollowers', () => {
  it('inserta nuevos y actualiza existentes sin duplicar', async () => {
    const { uc } = harness();
    const first = await uc.importFollowers.execute([exportDoc([{ username: 'Ana', timestamp: 1700000000 }, { username: 'bob', timestamp: 1700000100 }])]);
    expect(first).toMatchObject({ parsed: 2, inserted: 2, updated: 0 });

    const second = await uc.importFollowers.execute([exportDoc([{ username: 'ana', timestamp: 1700000500 }, { username: 'cid', timestamp: 1700000600 }])]);
    expect(second).toMatchObject({ parsed: 2, inserted: 1, updated: 1 });

    const page = await uc.listFollowers.execute({ filter: {}, sort: 'username' });
    expect(page.items.map((f) => f.username)).toEqual(['ana', 'bob', 'cid']);
  });

  it('reactiva a un seguidor eliminado que vuelve a seguir después', async () => {
    const { uc, clock, followers } = harness();
    await uc.importFollowers.execute([exportDoc([{ username: 'ana', timestamp: 1700000000 }])]);
    await uc.enqueueRemovals.execute(['ana']);
    const job = (await uc.claimNextRemoval.execute())!;
    await uc.reportRemovalResult.execute(job.id, { outcome: 'removed', instagramUserId: '1' });

    const removedAt = clock.now().getTime() / 1000;
    await uc.importFollowers.execute([exportDoc([{ username: 'ana', timestamp: Math.floor(removedAt) - 10 }])]);
    expect((await followers.findByUsernames(['ana']))[0].status).toBe('removed');

    await uc.importFollowers.execute([exportDoc([{ username: 'ana', timestamp: Math.floor(removedAt) + 3600 }])]);
    expect((await followers.findByUsernames(['ana']))[0].status).toBe('active');
  });
});
