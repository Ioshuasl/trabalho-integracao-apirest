import http from 'node:http';
import type { AddressInfo } from 'node:net';

type Pedido = Record<string, unknown>;

/** Linha da view do Grupo 5 (Contrato B), como a API de Pedidos devolve em GET /integracao/pedidos. */
export function pedidoG5(codigo: number, sobrescrever: Pedido = {}): Pedido {
  return {
    codigo_pedido: codigo,
    codigo_cliente: 101,
    nome_cliente: 'João Silva',
    endereco_entrega: 'Rua 10, 250, Setor Oeste',
    cidade_entrega: 'Goiânia',
    uf_entrega: 'GO',
    cep_entrega: '74120020',
    data_pedido: '2026-10-19T09:00:00.000-03:00',
    quantidade_itens: 3,
    valor_total: 179.7,
    status_pedido: 'CONFIRMADO',
    data_atualizacao: '2026-10-19T09:05:00.000-03:00',
    campo_novo_do_g5: 'deve ser ignorado',
    ...sobrescrever,
  };
}

export interface FakeG5 {
  url: string;
  pedidos: Pedido[];
  /** Respostas forçadas, consumidas uma a uma antes do comportamento normal. */
  falhas: { status?: number; atrasoMs?: number; corpo?: string }[];
  requisicoes: { caminho: string; chave: string | undefined; requestId: string | undefined }[];
  chaveEsperada: string;
  fechar(): Promise<void>;
}

/** Servidor HTTP que imita GET /integracao/pedidos da API de Pedidos do Grupo 5 (com paginação). */
export async function iniciarFakeG5(): Promise<FakeG5> {
  const fake: FakeG5 = {
    url: '',
    pedidos: [],
    falhas: [],
    requisicoes: [],
    chaveEsperada: 'g7-entregas-leitura-2026',
    fechar: () => new Promise((resolve) => server.close(() => resolve())),
  };

  const responder = (res: http.ServerResponse, status: number, corpo: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const chave = req.headers['x-api-key'] as string | undefined;
    fake.requisicoes.push({
      caminho: `${url.pathname}${url.search}`,
      chave,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    const forcada = fake.falhas.shift();
    if (forcada?.atrasoMs) await new Promise((r) => setTimeout(r, forcada.atrasoMs));
    if (forcada?.status || forcada?.corpo !== undefined) {
      return responder(res, forcada.status ?? 200, forcada.corpo ?? { erro: { codigo: 'ERRO_FORCADO', mensagem: 'x' } });
    }

    if (!chave) return responder(res, 401, { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'sem chave' } });
    if (chave !== fake.chaveEsperada) return responder(res, 401, { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'chave' } });

    if (url.pathname === '/api/v1/integracao/pedidos') {
      const pagina = Number(url.searchParams.get('pagina') ?? 1);
      const tamanho = Number(url.searchParams.get('tamanho') ?? 20);
      const inicio = (pagina - 1) * tamanho;
      return responder(res, 200, {
        dados: fake.pedidos.slice(inicio, inicio + tamanho),
        paginacao: {
          pagina,
          tamanho,
          total_registros: fake.pedidos.length,
          total_paginas: Math.ceil(fake.pedidos.length / tamanho),
        },
      });
    }
    return responder(res, 404, { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'rota' } });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  return fake;
}
