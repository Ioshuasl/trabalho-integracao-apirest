import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../logger';
import { formatarDataHora } from '../datetime';
import { isDbIndisponivel } from '../database/pool';
import { AppError, erros } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Aceita o X-Request-Id do consumidor (UUID) ou gera um; sempre devolve no cabeçalho de resposta. */
export const requestId: RequestHandler = (req, res, next) => {
  const enviado = req.header('x-request-id');
  req.requestId = enviado && UUID.test(enviado) ? enviado : randomUUID();
  req.log = logger.child({ request_id: req.requestId });
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

export const requestLogger: RequestHandler = (req, res, next) => {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    req.log.info(
      { metodo: req.method, caminho: req.originalUrl.split('?')[0], status_http: res.statusCode, duracao_ms: Math.round(duracaoMs) },
      'requisição concluída',
    );
  });
  next();
};

const hash = (valor: string) => createHash('sha256').update(valor).digest();
const iguais = (a: string, b: string) => timingSafeEqual(hash(a), hash(b));

/**
 * Perfis: `admin` (uso interno do G5, acesso total) e `integracao` (chave do G7: somente GET,
 * e somente em /integracao/*, como o Contrato B: o consumidor só enxerga a estrutura de integração).
 */
export const autenticar: RequestHandler = (req, _res, next) => {
  const chave = req.header('x-api-key');
  if (!chave) throw erros.naoAutenticado();

  if (iguais(chave, env.API_KEY_ADMIN)) req.perfil = 'admin';
  else if (iguais(chave, env.API_KEY_G7)) req.perfil = 'integracao';
  else throw erros.naoAutenticado();

  next();
};

export const exigirAdmin: RequestHandler = (req, _res, next) => {
  if (req.perfil !== 'admin') throw erros.semPermissao();
  next();
};

export const somenteLeitura: RequestHandler = (req, _res, next) => {
  if (req.perfil === 'integracao' && req.method !== 'GET' && req.method !== 'HEAD') throw erros.semPermissao();
  next();
};

export const rotaNaoEncontrada: RequestHandler = () => {
  throw erros.naoEncontrado('Rota inexistente.');
};

function converterErro(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const tipo = (err as { type?: unknown } | null)?.type;
  if (typeof tipo === 'string' && tipo.startsWith('entity.')) {
    const problema = tipo === 'entity.parse.failed' ? 'JSON malformado' : 'corpo da requisição inválido';
    return erros.requisicaoInvalida([{ campo: 'body', problema }]);
  }

  if (isDbIndisponivel(err)) return erros.servicoIndisponivel();
  return erros.erroInterno();
}

export const tratarErros: ErrorRequestHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const erro = converterErro(err);
  if (erro.status >= 500) req.log.error({ err }, 'erro ao processar requisição');

  res
    .status(erro.status)
    .set(erro.headers)
    .json({
      erro: { status: erro.status, codigo: erro.codigo, mensagem: erro.message, detalhes: erro.detalhes },
      caminho: req.originalUrl.split('?')[0],
      data_hora: formatarDataHora(new Date()),
      request_id: req.requestId,
    });
};
