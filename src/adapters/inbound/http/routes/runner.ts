import { Router } from 'express';
import { z } from 'zod';

/**
 * Telemetría del ejecutor (userscript): recibe las líneas de su registro y un latido,
 * las guarda en memoria y las imprime en la consola del servidor. No toca el dominio.
 */
export interface RunnerEvent {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const eventSchema = z.object({
  level: z.enum(['info', 'warn', 'error']).default('info'),
  message: z.string().max(2000),
});
const heartbeatSchema = z.object({
  running: z.boolean(),
  dryRun: z.boolean(),
  current: z.string().nullable().optional(),
  lastHour: z.number().int().nonnegative().optional(),
  pausedUntil: z.string().nullable().optional(),
});

export function runnerRouter(): Router {
  const r = Router();
  const events: RunnerEvent[] = [];
  let heartbeat: (z.infer<typeof heartbeatSchema> & { at: string }) | null = null;

  r.post('/runner/events', (req, res) => {
    const e = eventSchema.parse(req.body);
    const event: RunnerEvent = { at: new Date().toISOString(), ...e };
    events.push(event);
    if (events.length > 500) events.shift();
    const line = `[runner] ${event.message}`;
    if (e.level === 'error') console.error(line);
    else console.log(line);
    res.status(204).end();
  });

  r.post('/runner/heartbeat', (req, res) => {
    heartbeat = { at: new Date().toISOString(), ...heartbeatSchema.parse(req.body) };
    res.status(204).end();
  });

  r.get('/runner', (_req, res) => {
    const stale = heartbeat ? Date.now() - new Date(heartbeat.at).getTime() > 90_000 : true;
    res.json({ heartbeat, connected: !!heartbeat && !stale, events: events.slice(-200) });
  });

  return r;
}
