import { buildUseCases, type UseCases } from './application/index.js';
import { AutoDetectExportParser } from './adapters/outbound/instagram-export/auto-detect-export-parser.js';
import { openDatabase } from './adapters/outbound/persistence/sqlite/database.js';
import { SqliteFollowerRepository } from './adapters/outbound/persistence/sqlite/sqlite-follower-repository.js';
import { SqliteRemovalQueueRepository } from './adapters/outbound/persistence/sqlite/sqlite-removal-queue-repository.js';
import { SystemClock } from './adapters/outbound/system-clock.js';
import { loadConfig, type AppConfig } from './config.js';

export interface App {
  config: AppConfig;
  useCases: UseCases;
  close: () => void;
}

/** Raíz de composición: conecta puertos con adaptadores concretos. */
export function bootstrap(config: AppConfig = loadConfig()): App {
  const db = openDatabase(config.databasePath);
  const useCases = buildUseCases({
    followers: new SqliteFollowerRepository(db),
    queue: new SqliteRemovalQueueRepository(db),
    parser: new AutoDetectExportParser(),
    clock: new SystemClock(),
  });
  return { config, useCases, close: () => db.close() };
}
