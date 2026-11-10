import type { NextFunction, Request, Response } from 'express';

/** Registro de peticiones a /api en consola: método, ruta, estado y duración. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms} ms)`;
    if (res.statusCode >= 500) console.error(line);
    else console.log(line);
  });
  next();
}
