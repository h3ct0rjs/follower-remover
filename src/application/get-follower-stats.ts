import type { FollowerRepository, FollowerStats, MonthBucket } from '../domain/ports/follower-repository.js';
import type { QueueCounts, RemovalQueueRepository } from '../domain/ports/removal-queue-repository.js';

export interface Overview {
  followers: FollowerStats;
  queue: QueueCounts;
}

export class GetFollowerStats {
  constructor(
    private readonly followers: FollowerRepository,
    private readonly queue: RemovalQueueRepository,
  ) {}

  async overview(): Promise<Overview> {
    const [followers, queue] = await Promise.all([this.followers.stats(), this.queue.counts()]);
    return { followers, queue };
  }

  monthly(): Promise<MonthBucket[]> {
    return this.followers.monthlyBreakdown();
  }
}
