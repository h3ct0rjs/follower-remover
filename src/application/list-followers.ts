import type { FollowerFilter, FollowerRepository, FollowerSort, Page } from '../domain/ports/follower-repository.js';
import type { Follower } from '../domain/follower.js';

export interface ListFollowersQuery {
  filter: FollowerFilter;
  page?: number;
  pageSize?: number;
  sort?: FollowerSort;
}

export class ListFollowers {
  constructor(private readonly followers: FollowerRepository) {}

  execute(query: ListFollowersQuery): Promise<Page<Follower>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, query.pageSize ?? 100));
    return this.followers.findPage(query.filter, page, pageSize, query.sort ?? 'newest');
  }

  usernames(filter: FollowerFilter): Promise<string[]> {
    return this.followers.findUsernames(filter);
  }
}
