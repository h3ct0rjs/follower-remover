import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
/** Raíz del proyecto, válida tanto desde src/ (tsx) como desde dist/ (compilado). */
export const PROJECT_ROOT = resolve(here, '..');

export interface AppConfig {
  port: number;
  host: string;
  databasePath: string;
  publicDir: string;
  userscriptPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4310),
    host: env.HOST ?? '127.0.0.1',
    databasePath: env.DATABASE_PATH ?? resolve(PROJECT_ROOT, 'data', 'instagram-remover.db'),
    publicDir: resolve(PROJECT_ROOT, 'public'),
    userscriptPath: resolve(PROJECT_ROOT, 'userscript', 'instagram-remover.user.js'),
  };
}
