import { criarServicoImportacao } from '../modules/integracao-pedidos';
import { pool } from '../shared/database/pool';
import { logger } from '../shared/logger';

/** Mesmo serviço do POST /api/v1/integracoes/pedidos/importar, para rodar fora da API (ex.: agendador). */
criarServicoImportacao()
  .importar()
  .then((resumo) => {
    console.log(JSON.stringify(resumo, null, 2));
  })
  .catch((err) => {
    logger.error({ err }, 'importação de pedidos falhou');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
