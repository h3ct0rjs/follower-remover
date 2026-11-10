import type { RemovalJob, RemovalJobStatus } from '../removal-job.js';

export type QueueCounts = Record<RemovalJobStatus, number>;

export interface RemovalQueueRepository {
  enqueue(usernames: string[], now: Date): Promise<RemovalJob[]>;
  /** Devuelve los usernames que ya tienen un trabajo no terminado (pending/processing/failed). */
  findOpenUsernames(usernames: string[]): Promise<string[]>;
  /** Toma el siguiente pendiente y lo marca como processing de forma atómica. */
  claimNext(now: Date): Promise<RemovalJob | null>;
  findById(id: number): Promise<RemovalJob | null>;
  findByStatus(status: RemovalJobStatus): Promise<RemovalJob[]>;
  save(job: RemovalJob): Promise<void>;
  saveMany(jobs: RemovalJob[]): Promise<void>;
  list(status?: RemovalJobStatus | 'all'): Promise<RemovalJob[]>;
  deleteByIds(ids: number[]): Promise<number>;
  counts(): Promise<QueueCounts>;
}
