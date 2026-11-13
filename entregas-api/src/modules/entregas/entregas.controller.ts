import type { Request, RequestHandler } from 'express';
import { erros, type DetalheErro } from '../../shared/http/errors';
import {
  alterarStatusSchema,
  atualizarEntregaSchema,
  criarEntregaSchema,
  validarEstrutura,
} from './entregas.schemas';
import * as service from './entregas.service';
import type { FiltrosListagem } from './entregas.types';
import { isStatus } from './status';

const INT32_MAX = 2_147_483_647;
const INTEIRO_POSITIVO = /^[1-9]\d*$/;

function parseId(req: Request): number {
  const bruto = String(req.params.id_entrega);
  if (!INTEIRO_POSITIVO.test(bruto) || Number(bruto) > INT32_MAX) {
    throw erros.requisicaoInvalida([{ campo: 'id_entrega', problema: 'deve ser um inteiro positivo' }]);
  }
  return Number(bruto);
}

function parseFiltros(req: Request): FiltrosListagem {
  const { id_pedido, status_entrega, pagina, tamanho } = req.query;
  const detalhes: DetalheErro[] = [];

  const inteiro = (campo: string, valor: unknown, max: number): number | undefined => {
    if (valor === undefined) return undefined;
    if (typeof valor !== 'string' || !INTEIRO_POSITIVO.test(valor) || Number(valor) > max) {
      detalhes.push({ campo, problema: `deve ser um inteiro positivo${max < INT32_MAX ? ` (máximo ${max})` : ''}` });
      return undefined;
    }
    return Number(valor);
  };

  const filtros: FiltrosListagem = {
    id_pedido: inteiro('id_pedido', id_pedido, INT32_MAX),
    pagina: inteiro('pagina', pagina, INT32_MAX) ?? 1,
    tamanho: inteiro('tamanho', tamanho, 100) ?? 20,
  };

  if (status_entrega !== undefined) {
    if (typeof status_entrega === 'string' && isStatus(status_entrega)) filtros.status_entrega = status_entrega;
    else detalhes.push({ campo: 'status_entrega', problema: 'valor fora do enum permitido' });
  }

  if (detalhes.length > 0) throw erros.requisicaoInvalida(detalhes);
  return filtros;
}

export const listar: RequestHandler = async (req, res) => {
  res.status(200).json(await service.listar(parseFiltros(req)));
};

export const obter: RequestHandler = async (req, res) => {
  res.status(200).json(await service.obter(parseId(req)));
};

export const criar: RequestHandler = async (req, res) => {
  const dados = validarEstrutura(criarEntregaSchema, req.body);
  const entrega = await service.criar(dados);
  res.status(201).location(`/api/v1/entregas/${entrega.id_entrega}`).json(entrega);
};

export const atualizar: RequestHandler = async (req, res) => {
  const id = parseId(req);
  const dados = validarEstrutura(atualizarEntregaSchema, req.body);
  res.status(200).json(await service.atualizar(id, dados));
};

export const alterarStatus: RequestHandler = async (req, res) => {
  const id = parseId(req);
  const dados = validarEstrutura(alterarStatusSchema, req.body);
  res.status(200).json(await service.alterarStatus(id, dados));
};

export const historico: RequestHandler = async (req, res) => {
  res.status(200).json({ dados: await service.historico(parseId(req)) });
};

export const excluir: RequestHandler = async (req, res) => {
  await service.excluir(parseId(req));
  res.status(204).end();
};
