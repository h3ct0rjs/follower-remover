import { createServer } from './adapters/inbound/http/server.js';
import { bootstrap } from './bootstrap.js';

const { config, useCases, close } = bootstrap();
const app = createServer(useCases, config);

const server = app.listen(config.port, config.host, () => {
  console.log(`Instagram Remover escuchando en http://${config.host}:${config.port}`);
  console.log(`Base de datos: ${config.databasePath}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      close();
      process.exit(0);
    });
  });
}
