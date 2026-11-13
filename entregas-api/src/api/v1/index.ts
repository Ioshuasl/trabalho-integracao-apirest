import { Router } from 'express';
import { entregasRouter } from '../../modules/entregas';
import { healthRouter } from '../../modules/health';
import { criarIntegracaoPedidosRouterPadrao, criarServicoImportacao, type ClienteG5 } from '../../modules/integracao-pedidos';
import { autenticar } from '../../shared/http/middlewares';

export interface DependenciasV1 {
  /** Cliente da API de Pedidos (G5); os testes injetam um simulado. */
  clienteG5?: ClienteG5;
}

/** API versionada: tudo que o contrato 1.0 expõe fica sob /api/v1. */
export function criarV1Router(deps: DependenciasV1 = {}): Router {
  const router = Router();

  router.use('/health', healthRouter); // sem X-API-Key
  router.use(autenticar);
  router.use('/entregas', entregasRouter);
  router.use('/integracoes', criarIntegracaoPedidosRouterPadrao(criarServicoImportacao(deps.clienteG5)));

  return router;
}
