// API pública do módulo: outros módulos só devem importar daqui.
import { env } from '../../config/env';
import { pool } from '../../shared/database/pool';
import { logger } from '../../shared/logger';
import { ClienteG5Http, type ClienteG5, type Registrador } from './g5.client';
import { ImportacaoPedidosService } from './importacao.service';
import { criarIntegracaoPedidosRouter } from './integracao.routes';
import { registrarLog } from './integracao.repository';

export { ClienteG5Http, G5Error, type ClienteG5, type ConfigG5 } from './g5.client';
export { ImportacaoPedidosService } from './importacao.service';

/** Grava cada ocorrência em integracao_logs e no log da aplicação; falha ao logar nunca derruba a integração. */
export const registrarOcorrencia: Registrador = async (registro) => {
  logger.info({ integracao: registro }, `G5 ${registro.metodo} ${registro.endpoint}: ${registro.tipo}`);
  try {
    await registrarLog(pool, registro);
  } catch (err) {
    logger.warn({ err }, 'não foi possível gravar integracao_logs');
  }
};

export function criarClienteG5PadraoDoAmbiente(): ClienteG5 {
  return new ClienteG5Http(
    {
      baseUrl: env.G5_BASE_URL,
      apiKey: env.G5_API_KEY,
      timeoutMs: env.G5_TIMEOUT_MS,
      retryDelaysMs: env.G5_RETRY_DELAYS_MS,
    },
    registrarOcorrencia,
  );
}

export function criarServicoImportacao(cliente: ClienteG5 = criarClienteG5PadraoDoAmbiente()): ImportacaoPedidosService {
  return new ImportacaoPedidosService(cliente, registrarOcorrencia);
}

export function criarIntegracaoPedidosRouterPadrao(servico = criarServicoImportacao()) {
  return criarIntegracaoPedidosRouter(servico);
}
