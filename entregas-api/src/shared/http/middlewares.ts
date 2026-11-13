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

type Perfil = 'escrita' | 'leitura';

const hash = (valor: string) => createHash('sha256').update(valor).digest();
const iguais = (a: string, b: string) => timingSafeEqual(hash(a), hash(b));

function identificarPerfil(chave: string): Perfil | null {
  if (iguais(chave, env.API_KEY_WRITE)) return 'escrita';
  if (iguais(chave, env.API_KEY_READ)) return 'leitura';
  return null;
}

/** 401 para chave ausente/inválida; 403 para chave somente leitura em método de escrita. */
export const autenticar: RequestHandler = (req, _res, next) => {
  const chave = req.header('x-api-key');
  const perfil = chave ? identificarPerfil(chave) : null;
  if (!perfil) throw erros.naoAutenticado();
  if (perfil === 'leitura' && req.method !== 'GET' && req.method !== 'HEAD') throw erros.semPermissao();
  next();
};

export const rotaNaoEncontrada: RequestHandler = () => {
  throw erros.naoEncontrado('Rota inexistente.');
};

function converterErro(err: unknown): AppError {
  if (err instanceof AppError) return err;

  // Erros do body-parser (JSON malformado, corpo grande demais, etc.)
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
