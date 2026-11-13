import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { criarV1Router, type DependenciasV1 } from './api/v1';
import { openapi } from './docs/openapi';
import { requestId, requestLogger, rotaNaoEncontrada, tratarErros } from './shared/http/middlewares';

export function createApp(deps: DependenciasV1 = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(requestLogger);
  // Documentação interativa, sem X-API-Key (mesmo padrão do G2)
  app.get('/openapi.json', (_req, res) => {
    res.json(openapi);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'API de Entregas — Grupo 7' }));

  app.use('/api/v1', criarV1Router(deps));
  app.use(rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
