import { DomainError } from '../domain/errors.js';
import { transition, type RemovalJob, type RemovalOutcome } from '../domain/removal-job.js';
import type { Clock } from '../domain/ports/clock.js';
import type { FollowerRepository } from '../domain/ports/follower-repository.js';
import type { RemovalQueueRepository } from '../domain/ports/removal-queue-repository.js';

export interface RemovalReport {
  outcome: RemovalOutcome;
  instagramUserId?: string | null;
  error?: string | null;
}

/** El script del navegador informa el resultado de un trabajo. */
export class ReportRemovalResult {
  constructor(
    private readonly followers: FollowerRepository,
    private readonly queue: RemovalQueueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(jobId: number, report: RemovalReport): Promise<RemovalJob> {
    const job = await this.queue.findById(jobId);
    if (!job) throw new DomainError('JOB_NOT_FOUND', `No existe el trabajo #${jobId}`);
    const now = this.clock.now();
    const base = { attempts: job.attempts + 1, instagramUserId: report.instagramUserId ?? job.instagramUserId };

    let next: RemovalJob;
    if (report.outcome === 'failed') {
      next = transition(job, 'failed', now, { ...base, lastError: report.error ?? 'Error desconocido' });
    } else {
      const note = report.outcome === 'already_not_following' ? 'Ya no te seguía' : null;
      next = transition(job, 'done', now, { ...base, lastError: note });
      await this.followers.setStatus([job.username], 'removed', now);
    }
    await this.queue.save(next);
    return next;
  }
}
