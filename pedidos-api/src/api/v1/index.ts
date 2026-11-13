import { Router } from 'express';
import { clientesRouter } from '../../modules/clientes';
import { healthRouter } from '../../modules/health';
import { integracaoRouter, pedidosRouter } from '../../modules/pedidos';
import { autenticar, exigirAdmin, somenteLeitura } from '../../shared/http/middlewares';

/** API versionada: tudo que o contrato 1.0 expõe fica sob /api/v1. */
export const v1Router = Router();

v1Router.use('/health', healthRouter); // sem X-API-Key
v1Router.use(autenticar);
v1Router.use('/integracao', somenteLeitura, integracaoRouter); // chave do G7 só enxerga isto
v1Router.use('/clientes', exigirAdmin, clientesRouter);
v1Router.use('/pedidos', exigirAdmin, pedidosRouter);
