import { Router } from 'express';
import type { UseCases } from '../../../../application/index.js';
import { followerQuerySchema, toFilter } from '../parse-query.js';

export function followersRouter(uc: UseCases): Router {
  const r = Router();

  r.get('/stats', async (_req, res) => {
    res.json(await uc.stats.overview());
  });

  r.get('/followers/months', async (_req, res) => {
    res.json(await uc.stats.monthly());
  });

  r.get('/followers/usernames', async (req, res) => {
    const { filter } = toFilter(followerQuerySchema.parse(req.query));
    res.json({ usernames: await uc.listFollowers.usernames(filter) });
  });

  r.get('/followers', async (req, res) => {
    res.json(await uc.listFollowers.execute(toFilter(followerQuerySchema.parse(req.query))));
  });

  return r;
}
