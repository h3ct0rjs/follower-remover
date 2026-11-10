import { Router } from 'express';
import { z } from 'zod';
import type { UseCases } from '../../../../application/index.js';

const enqueueSchema = z.object({ usernames: z.array(z.string().min(1)).min(1).max(20000) });
const reportSchema = z.object({
  outcome: z.enum(['removed', 'already_not_following', 'failed']),
  instagramUserId: z.string().nullable().optional(),
  error: z.string().max(2000).nullable().optional(),
});
const idParam = z.coerce.number().int().positive();

/** Versión mínima del userscript admitida para reclamar trabajos; evita que un script viejo siga procesando. */
export const MIN_RUNNER_VERSION = '0.4.0';
const claimSchema = z.object({ version: z.string().optional() }).optional();
const versionAtLeast = (v: string, min: string): boolean => {
  const a = v.split('.').map(Number), b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};
const statusQuery = z.enum(['pending', 'processing', 'done', 'failed', 'cancelled', 'all']).optional();

export function queueRouter(uc: UseCases): Router {
  const r = Router();

  r.get('/queue', async (req, res) => {
    const status = statusQuery.parse(req.query.status) as Parameters<typeof uc.manageQueue.list>[0];
    res.json({ jobs: await uc.manageQueue.list(status), counts: (await uc.stats.overview()).queue });
  });

  r.post('/queue', async (req, res) => {
    const { usernames } = enqueueSchema.parse(req.body);
    res.status(201).json(await uc.enqueueRemovals.execute(usernames));
  });

  /** Usado por el userscript: toma el siguiente trabajo. 204 si no hay nada. */
  r.post('/queue/claim', async (req, res) => {
    const version = claimSchema.parse(req.body)?.version;
    if (!version || !versionAtLeast(version, MIN_RUNNER_VERSION)) {
      res.status(426).json({
        error: `Userscript desactualizado (${version ?? 'sin versión'}); instala la versión ${MIN_RUNNER_VERSION} o superior desde la pestaña Ejecutor`,
        code: 'RUNNER_OUTDATED',
      });
      return;
    }
    const job = await uc.claimNextRemoval.execute();
    if (!job) res.status(204).end();
    else res.json(job);
  });

  r.post('/queue/retry-failed', async (_req, res) => {
    res.json({ retried: await uc.manageQueue.retryFailed() });
  });

  r.delete('/queue/finished', async (_req, res) => {
    res.json({ deleted: await uc.manageQueue.clearFinished() });
  });

  r.post('/queue/:id/result', async (req, res) => {
    res.json(await uc.reportRemovalResult.execute(idParam.parse(req.params.id), reportSchema.parse(req.body)));
  });

  r.post('/queue/:id/cancel', async (req, res) => {
    res.json(await uc.manageQueue.cancel(idParam.parse(req.params.id)));
  });

  r.post('/queue/:id/release', async (req, res) => {
    res.json(await uc.manageQueue.release(idParam.parse(req.params.id)));
  });

  return r;
}
