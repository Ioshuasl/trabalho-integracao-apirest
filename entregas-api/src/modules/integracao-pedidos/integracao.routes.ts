import { Router, type Request, type RequestHandler } from 'express';
import { pool } from '../../shared/database/pool';
import { erros } from '../../shared/http/errors';
import type { ImportacaoPedidosService } from './importacao.service';
import * as repo from './integracao.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLimite(req: Request): number {
  const bruto = req.query.limite;
  if (bruto === undefined) return 50;
  if (typeof bruto !== 'string' || !/^[1-9]\d*$/.test(bruto) || Number(bruto) > 200) {
    throw erros.requisicaoInvalida([{ campo: 'limite', problema: 'deve ser um inteiro entre 1 e 200' }]);
  }
  return Number(bruto);
}

export function criarIntegracaoPedidosRouter(servico: ImportacaoPedidosService): Router {
  const router = Router();

  const importar: RequestHandler = async (_req, res) => {
    res.status(200).json(await servico.importar());
  };

  const listarImportados: RequestHandler = async (req, res) => {
    res.status(200).json({ dados: await repo.listarImportados(pool, parseLimite(req)) });
  };

  const listarLogs: RequestHandler = async (req, res) => {
    const limite = parseLimite(req);
    const importacaoId = req.query.importacao_id;
    if (importacaoId !== undefined && (typeof importacaoId !== 'string' || !UUID.test(importacaoId))) {
      throw erros.requisicaoInvalida([{ campo: 'importacao_id', problema: 'deve ser um UUID' }]);
    }
    res.status(200).json({ dados: await repo.listarLogs(pool, limite, importacaoId as string | undefined) });
  };

  router.post('/pedidos/importar', importar);
  router.get('/pedidos', listarImportados);
  router.get('/logs', listarLogs);
  return router;
}
