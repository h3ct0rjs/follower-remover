import { DomainError } from '../domain/errors.js';
import { transition, type RemovalJob, type RemovalJobStatus } from '../domain/removal-job.js';
import type { Clock } from '../domain/ports/clock.js';
import type { FollowerRepository } from '../domain/ports/follower-repository.js';
import type { RemovalQueueRepository } from '../domain/ports/removal-queue-repository.js';

/** Operaciones de mantenimiento de la cola desde la interfaz web. */
export class ManageQueue {
  constructor(
    private readonly followers: FollowerRepository,
    private readonly queue: RemovalQueueRepository,
    private readonly clock: Clock,
  ) {}

  list(status?: RemovalJobStatus | 'all'): Promise<RemovalJob[]> {
    return this.queue.list(status);
  }

  /** Cancela un trabajo pendiente o fallido; el seguidor vuelve a "active". */
  async cancel(jobId: number): Promise<RemovalJob> {
    const job = await this.require(jobId);
    const next = transition(job, 'cancelled', this.clock.now());
    await this.queue.save(next);
    await this.followers.setStatus([job.username], 'active', null);
    return next;
  }

  /** Devuelve un trabajo a "pending" (reintento manual o liberación por rate limit). */
  async release(jobId: number): Promise<RemovalJob> {
    const job = await this.require(jobId);
    const next = transition(job, 'pending', this.clock.now(), { lastError: null });
    await this.queue.save(next);
    await this.followers.setStatus([job.username], 'queued', null);
    return next;
  }

  async retryFailed(): Promise<number> {
    const now = this.clock.now();
    const failed = await this.queue.findByStatus('failed');
    if (!failed.length) return 0;
    await this.queue.saveMany(failed.map((j) => transition(j, 'pending', now, { lastError: null })));
    return failed.length;
  }

  /** Borra del historial los trabajos terminados. Los fallidos liberan a su seguidor. */
  async clearFinished(): Promise<number> {
    const [done, failed, cancelled] = await Promise.all([
      this.queue.findByStatus('done'),
      this.queue.findByStatus('failed'),
      this.queue.findByStatus('cancelled'),
    ]);
    if (failed.length) await this.followers.setStatus(failed.map((j) => j.username), 'active', null);
    return this.queue.deleteByIds([...done, ...failed, ...cancelled].map((j) => j.id));
  }

  private async require(jobId: number): Promise<RemovalJob> {
    const job = await this.queue.findById(jobId);
    if (!job) throw new DomainError('JOB_NOT_FOUND', `No existe el trabajo #${jobId}`);
    return job;
  }
}
