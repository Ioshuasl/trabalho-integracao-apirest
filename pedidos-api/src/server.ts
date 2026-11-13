import { createApp } from './app';
import { env } from './config/env';
import { pool } from './shared/database/pool';
import { logger } from './shared/logger';

const server = createApp().listen(env.PORT, () => {
  logger.info({ porta: env.PORT }, `API de Pedidos ouvindo em http://localhost:${env.PORT}/api/v1`);
});

function encerrar(sinal: string): void {
  logger.info({ sinal }, 'encerrando');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
