import { logger } from '../logger';
import { executarMigracoes } from './migrate';
import { pool } from './pool';

executarMigracoes(pool)
  .then((aplicadas) => {
    logger.info({ aplicadas }, aplicadas.length ? 'migrations aplicadas' : 'banco já está atualizado');
  })
  .catch((err) => {
    logger.error({ err }, 'falha ao aplicar migrations');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
