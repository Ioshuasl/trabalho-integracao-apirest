import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { v1Router } from './api/v1';
import { openapi } from './docs/openapi';
import { requestId, requestLogger, rotaNaoEncontrada, tratarErros } from './shared/http/middlewares';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(requestLogger);

  // Documentação interativa, sem X-API-Key
  app.get('/openapi.json', (_req, res) => {
    res.json(openapi);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'API de Pedidos — Grupo 5' }));

  app.use('/api/v1', v1Router);
  app.use(rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
