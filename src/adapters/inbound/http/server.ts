import cors from 'cors';
import express, { type Express } from 'express';
import { readFile } from 'node:fs/promises';
import type { UseCases } from '../../../application/index.js';
import type { AppConfig } from '../../../config.js';
import { errorHandler } from './http-error.js';
import { followersRouter } from './routes/followers.js';
import { importsRouter } from './routes/imports.js';
import { queueRouter } from './routes/queue.js';
import { runnerRouter } from './routes/runner.js';
import { requestLogger } from './request-logger.js';

export function createServer(uc: UseCases, config: AppConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: ['https://www.instagram.com', `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`] }));
  app.use(express.json({ limit: '50mb' }));

  app.use('/api', requestLogger, followersRouter(uc), importsRouter(uc), queueRouter(uc), runnerRouter());

  /** Sirve el userscript con la URL de esta API ya inyectada; Tampermonkey detecta la extensión .user.js. */
  app.get('/userscript/instagram-remover.user.js', async (_req, res, next) => {
    try {
      const base = `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}`;
      const source = await readFile(config.userscriptPath, 'utf8');
      res.type('application/javascript').send(source.replaceAll('__API_BASE__', base));
    } catch (err) {
      next(err);
    }
  });

  app.use(express.static(config.publicDir));
  app.use(errorHandler);
  return app;
}
