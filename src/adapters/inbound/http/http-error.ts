import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../../../domain/errors.js';

const STATUS_BY_CODE: Record<string, number> = {
  JOB_NOT_FOUND: 404,
  INVALID_JOB_TRANSITION: 409,
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Solicitud inválida', details: err.flatten() });
    return;
  }
  if (err instanceof DomainError) {
    res.status(STATUS_BY_CODE[err.code] ?? 400).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: 'JSON malformado' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
}
