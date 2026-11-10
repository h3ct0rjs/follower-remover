import { REMOVAL_JOB_STATUSES, type RemovalJob, type RemovalJobStatus } from '../../../../domain/removal-job.js';
import type { QueueCounts, RemovalQueueRepository } from '../../../../domain/ports/removal-queue-repository.js';

/** Implementación en memoria para pruebas. */
export class InMemoryRemovalQueueRepository implements RemovalQueueRepository {
  readonly rows = new Map<number, RemovalJob>();
  private seq = 0;

  async enqueue(usernames: string[], now: Date): Promise<RemovalJob[]> {
    return usernames.map((username) => {
      const job: RemovalJob = {
        id: ++this.seq,
        username,
        status: 'pending',
        attempts: 0,
        lastError: null,
        instagramUserId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.rows.set(job.id, job);
      return job;
    });
  }

  async findOpenUsernames(usernames: string[]): Promise<string[]> {
    const wanted = new Set(usernames);
    const open = new Set<string>();
    for (const j of this.rows.values()) {
      if (wanted.has(j.username) && (j.status === 'pending' || j.status === 'processing' || j.status === 'failed')) open.add(j.username);
    }
    return [...open];
  }

  async claimNext(now: Date): Promise<RemovalJob | null> {
    const next = [...this.rows.values()].filter((j) => j.status === 'pending').sort((a, b) => a.id - b.id)[0];
    if (!next) return null;
    const claimed: RemovalJob = { ...next, status: 'processing', updatedAt: now };
    this.rows.set(claimed.id, claimed);
    return claimed;
  }

  async findById(id: number): Promise<RemovalJob | null> {
    return this.rows.get(id) ?? null;
  }

  async findByStatus(status: RemovalJobStatus): Promise<RemovalJob[]> {
    return [...this.rows.values()].filter((j) => j.status === status).sort((a, b) => a.id - b.id);
  }

  async save(job: RemovalJob): Promise<void> {
    this.rows.set(job.id, job);
  }

  async saveMany(jobs: RemovalJob[]): Promise<void> {
    for (const j of jobs) this.rows.set(j.id, j);
  }

  async list(status: RemovalJobStatus | 'all' = 'all'): Promise<RemovalJob[]> {
    return [...this.rows.values()].filter((j) => status === 'all' || j.status === status).sort((a, b) => b.id - a.id);
  }

  async deleteByIds(ids: number[]): Promise<number> {
    let n = 0;
    for (const id of ids) if (this.rows.delete(id)) n++;
    return n;
  }

  async counts(): Promise<QueueCounts> {
    const counts = Object.fromEntries(REMOVAL_JOB_STATUSES.map((s) => [s, 0])) as QueueCounts;
    for (const j of this.rows.values()) counts[j.status]++;
    return counts;
  }
}
