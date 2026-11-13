import express, { Router, type RequestHandler } from 'express';
import { erros } from '../../shared/http/errors';
import * as controller from './entregas.controller';

/** POST, PUT e PATCH exigem Content-Type: application/json (contrato, seção 1.1). */
const exigirJson: RequestHandler = (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    throw erros.requisicaoInvalida([
      { campo: 'Content-Type', problema: 'deve ser application/json e o corpo é obrigatório' },
    ]);
  }
  next();
};

export const entregasRouter = Router();

entregasRouter.use(exigirJson);
entregasRouter.use(express.json({ limit: '100kb' }));

entregasRouter.get('/', controller.listar);
entregasRouter.post('/', controller.criar);
entregasRouter.get('/:id_entrega', controller.obter);
entregasRouter.put('/:id_entrega', controller.atualizar);
entregasRouter.delete('/:id_entrega', controller.excluir);
entregasRouter.patch('/:id_entrega/status', controller.alterarStatus);
entregasRouter.get('/:id_entrega/historico', controller.historico);
