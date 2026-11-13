import { Router, type RequestHandler } from 'express';
import { corpoJson } from '../../shared/http/corpo-json';
import type { DetalheErro } from '../../shared/http/errors';
import {
  lancarSeHouver400,
  lerInteiroQuery,
  lerPaginacao,
  parseIdRota,
  validarEstrutura,
} from '../../shared/http/parametros';
import { alterarStatusSchema, atualizarPedidoSchema, criarPedidoSchema } from './pedidos.schemas';
import * as service from './pedidos.service';
import type { FiltrosPedidos } from './pedidos.types';
import { isStatusPedido } from './status';

function lerFiltros(query: Record<string, unknown>): FiltrosPedidos {
  const detalhes: DetalheErro[] = [];
  const filtros: FiltrosPedidos = {
    ...lerPaginacao(detalhes, query),
    codigo_cliente: lerInteiroQuery(detalhes, 'codigo_cliente', query.codigo_cliente),
  };
  if (query.status_pedido !== undefined) {
    if (typeof query.status_pedido === 'string' && isStatusPedido(query.status_pedido)) {
      filtros.status_pedido = query.status_pedido;
    } else {
      detalhes.push({ campo: 'status_pedido', problema: 'valor fora do enum permitido' });
    }
  }
  lancarSeHouver400(detalhes);
  return filtros;
}

const id = (req: Parameters<RequestHandler>[0]) => parseIdRota(req.params.codigo_pedido, 'codigo_pedido');

export const pedidosRouter = Router();
pedidosRouter.use(corpoJson);

pedidosRouter.get('/', async (req, res) => {
  res.status(200).json(await service.listar(lerFiltros(req.query)));
});

pedidosRouter.post('/', async (req, res) => {
  const pedido = await service.criar(validarEstrutura(criarPedidoSchema, req.body));
  res.status(201).location(`/api/v1/pedidos/${pedido.codigo_pedido}`).json(pedido);
});

pedidosRouter.get('/:codigo_pedido', async (req, res) => {
  res.status(200).json(await service.obter(id(req)));
});

pedidosRouter.put('/:codigo_pedido', async (req, res) => {
  const codigo = id(req);
  res.status(200).json(await service.atualizar(codigo, validarEstrutura(atualizarPedidoSchema, req.body)));
});

pedidosRouter.patch('/:codigo_pedido/status', async (req, res) => {
  const codigo = id(req);
  res.status(200).json(await service.alterarStatus(codigo, validarEstrutura(alterarStatusSchema, req.body)));
});

pedidosRouter.delete('/:codigo_pedido', async (req, res) => {
  await service.excluir(id(req));
  res.status(204).end();
});

/** Estrutura de integração consumida pelo G7: somente leitura, só CONFIRMADO/CANCELADO, sem itens. */
export const integracaoRouter = Router();

integracaoRouter.get('/pedidos', async (req, res) => {
  const detalhes: DetalheErro[] = [];
  const { pagina, tamanho } = lerPaginacao(detalhes, req.query);
  lancarSeHouver400(detalhes);
  res.status(200).json(await service.listarIntegracao(pagina, tamanho));
});
