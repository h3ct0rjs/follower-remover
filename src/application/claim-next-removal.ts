import { transition, type RemovalJob } from '../domain/removal-job.js';
import type { Clock } from '../domain/ports/clock.js';
import type { RemovalQueueRepository } from '../domain/ports/removal-queue-repository.js';

const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Lo usa el script del navegador: entrega el siguiente trabajo pendiente.
 * Antes libera trabajos que quedaron "processing" demasiado tiempo (script cerrado a mitad).
 */
export class ClaimNextRemoval {
  constructor(
    private readonly queue: RemovalQueueRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<RemovalJob | null> {
    const now = this.clock.now();
    const stale = (await this.queue.findByStatus('processing')).filter(
      (j) => now.getTime() - j.updatedAt.getTime() > STALE_PROCESSING_MS,
    );
    if (stale.length) await this.queue.saveMany(stale.map((j) => transition(j, 'pending', now)));
    return this.queue.claimNext(now);
  }
}
