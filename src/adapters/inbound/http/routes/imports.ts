import { Router } from 'express';
import { z } from 'zod';
import type { UseCases } from '../../../../application/index.js';

const bodySchema = z.object({ documents: z.array(z.unknown()).min(1).max(200) });

export function importsRouter(uc: UseCases): Router {
  const r = Router();

  /** El frontend lee los followers_N.json en el navegador y los envía ya parseados. */
  r.post('/imports', async (req, res) => {
    const { documents } = bodySchema.parse(req.body);
    res.status(201).json(await uc.importFollowers.execute(documents));
  });

  return r;
}
