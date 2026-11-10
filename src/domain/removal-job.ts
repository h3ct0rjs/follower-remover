import { DomainError } from './errors.js';

/**
 * Ciclo de vida de un trabajo de eliminación:
 *   pending → processing → done | failed
 *   failed → pending (reintento)       processing → pending (liberado por rate limit / script caído)
 *   pending | failed → cancelled
 */
export type RemovalJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';
export const REMOVAL_JOB_STATUSES: readonly RemovalJobStatus[] = ['pending', 'processing', 'done', 'failed', 'cancelled'];

export type RemovalOutcome = 'removed' | 'already_not_following' | 'failed';

export interface RemovalJob {
  readonly id: number;
  readonly username: string;
  readonly status: RemovalJobStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly instagramUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const TRANSITIONS: Record<RemovalJobStatus, readonly RemovalJobStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['done', 'failed', 'pending'],
  failed: ['pending', 'cancelled'],
  done: [],
  cancelled: ['pending'],
};

export function canTransition(from: RemovalJobStatus, to: RemovalJobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(job: RemovalJob, to: RemovalJobStatus, now: Date, patch: Partial<Pick<RemovalJob, 'lastError' | 'instagramUserId' | 'attempts'>> = {}): RemovalJob {
  if (!canTransition(job.status, to)) {
    throw new DomainError('INVALID_JOB_TRANSITION', `No se puede pasar el trabajo #${job.id} de "${job.status}" a "${to}"`);
  }
  return { ...job, ...patch, status: to, updatedAt: now };
}

export function isFinished(job: RemovalJob): boolean {
  return job.status === 'done' || job.status === 'failed' || job.status === 'cancelled';
}
