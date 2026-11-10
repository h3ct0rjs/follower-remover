import type { Clock } from '../domain/ports/clock.js';
import type { FollowerExportParser } from '../domain/ports/follower-export-parser.js';
import type { FollowerRepository } from '../domain/ports/follower-repository.js';
import type { RemovalQueueRepository } from '../domain/ports/removal-queue-repository.js';
import { ClaimNextRemoval } from './claim-next-removal.js';
import { EnqueueRemovals } from './enqueue-removals.js';
import { GetFollowerStats } from './get-follower-stats.js';
import { ImportFollowers } from './import-followers.js';
import { ListFollowers } from './list-followers.js';
import { ManageQueue } from './manage-queue.js';
import { ReportRemovalResult } from './report-removal-result.js';

export interface Dependencies {
  followers: FollowerRepository;
  queue: RemovalQueueRepository;
  parser: FollowerExportParser;
  clock: Clock;
}

export interface UseCases {
  importFollowers: ImportFollowers;
  listFollowers: ListFollowers;
  stats: GetFollowerStats;
  enqueueRemovals: EnqueueRemovals;
  claimNextRemoval: ClaimNextRemoval;
  reportRemovalResult: ReportRemovalResult;
  manageQueue: ManageQueue;
}

/** Composición de los casos de uso a partir de los adaptadores de salida. */
export function buildUseCases(deps: Dependencies): UseCases {
  return {
    importFollowers: new ImportFollowers(deps.parser, deps.followers),
    listFollowers: new ListFollowers(deps.followers),
    stats: new GetFollowerStats(deps.followers, deps.queue),
    enqueueRemovals: new EnqueueRemovals(deps.followers, deps.queue, deps.clock),
    claimNextRemoval: new ClaimNextRemoval(deps.queue, deps.clock),
    reportRemovalResult: new ReportRemovalResult(deps.followers, deps.queue, deps.clock),
    manageQueue: new ManageQueue(deps.followers, deps.queue, deps.clock),
  };
}
