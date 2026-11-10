import { normalizeUsername } from '../domain/follower.js';
import type { Clock } from '../domain/ports/clock.js';
import type { FollowerRepository } from '../domain/ports/follower-repository.js';
import type { RemovalQueueRepository } from '../domain/ports/removal-queue-repository.js';

export interface EnqueueRemovalsResult {
  queued: string[];
  skipped: { unknown: string[]; alreadyRemoved: string[]; alreadyQueued: string[] };
}

/** Pone en cola de eliminación a los seguidores indicados. */
export class EnqueueRemovals {
  constructor(
    private readonly followers: FollowerRepository,
    private readonly queue: RemovalQueueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(rawUsernames: string[]): Promise<EnqueueRemovalsResult> {
    const usernames = [...new Set(rawUsernames.map(normalizeUsername).filter(Boolean))];
    const known = new Map((await this.followers.findByUsernames(usernames)).map((f) => [f.username, f]));
    const open = new Set(await this.queue.findOpenUsernames(usernames));

    const result: EnqueueRemovalsResult = { queued: [], skipped: { unknown: [], alreadyRemoved: [], alreadyQueued: [] } };
    for (const u of usernames) {
      const f = known.get(u);
      if (!f) result.skipped.unknown.push(u);
      else if (f.status === 'removed') result.skipped.alreadyRemoved.push(u);
      else if (open.has(u)) result.skipped.alreadyQueued.push(u);
      else result.queued.push(u);
    }

    if (result.queued.length > 0) {
      await this.queue.enqueue(result.queued, this.clock.now());
      await this.followers.setStatus(result.queued, 'queued', null);
    }
    return result;
  }
}
