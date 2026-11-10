import type { DateRange } from '../date-range.js';
import type { Follower, FollowerStatus } from '../follower.js';

export interface FollowerFilter {
  range?: DateRange;
  search?: string;
  status?: FollowerStatus | 'all';
}

export type FollowerSort = 'newest' | 'oldest' | 'username';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FollowerStats {
  total: number;
  active: number;
  queued: number;
  removed: number;
  oldest: Date | null;
  newest: Date | null;
}

export interface MonthBucket {
  /** YYYY-MM en hora local del servidor */
  month: string;
  total: number;
  active: number;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
}

export interface FollowerRepository {
  upsertMany(followers: Follower[]): Promise<UpsertResult>;
  findByUsernames(usernames: string[]): Promise<Follower[]>;
  findPage(filter: FollowerFilter, page: number, pageSize: number, sort: FollowerSort): Promise<Page<Follower>>;
  findUsernames(filter: FollowerFilter): Promise<string[]>;
  setStatus(usernames: string[], status: FollowerStatus, removedAt: Date | null): Promise<void>;
  stats(): Promise<FollowerStats>;
  monthlyBreakdown(): Promise<MonthBucket[]>;
}
