import { readFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/shared/database/pool';
import { CHAVE_ADMIN, CHAVE_G7 } from './test-env';

const app = createApp();
const BASE = '/api/v1';
const admin = { 'X-API-Key': CHAVE_ADMIN };
const g7 = { 'X-API-Key': CHAVE_G7 };

function novoPedido(sobrescrever: Record<string, unknown> = {}) {
  return {
    codigo_cliente: 1,
    endereco_entrega: 'Rua 10, 250, Setor Oeste',
    cidade_entrega: 'Goiânia',
    uf_entrega: 'GO',
    cep_entrega: '74120020',
    itens: [
      { descricao: 'Camiseta básica', quantidade: 3, preco_unitario: 59.9 },
      { descricao: 'Caneca', quantidade: 1, preco_unitario: 10 },
    ],
    ...sobrescrever,
  };
}

async function criarPedido(sobrescrever: Record<string, unknown> = {}) {
  const res = await request(app).post(`${BASE}/pedidos`).set(admin).send(novoPedido(sobrescrever));
  expect(res.status).toBe(201);
  return res.body as { codigo_pedido: number; data_atualizacao: string; valor_total: number };
}

const status = (id: number, status_pedido: string) =>
  request(app).patch(`${BASE}/pedidos/${id}/status`).set(admin).send({ status_pedido });

beforeEach(async () => {
  const sql = await readFile(path.resolve(__dirname, '../seeds/dados_teste.sql'), 'utf8');
  await pool.query(sql);
});

afterAll(async () => {
  await pool.end();
});

describe('health, autenticação e perfis', () => {
  it('health responde 200 sem chave', async () => {
    const res = await request(app).get(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'UP' });
  });

  it('401 sem chave ou com chave inválida, com formato de erro padrão', async () => {
    const semChave = await request(app).get(`${BASE}/pedidos`);
    expect(semChave.status).toBe(401);
    expect(semChave.body.erro).toMatchObject({ status: 401, codigo: 'NAO_AUTENTICADO', detalhes: [] });
    expect(semChave.body.request_id).toBe(semChave.headers['x-request-id']);
    expect((await request(app).get(`${BASE}/pedidos`).set('X-API-Key', 'x')).status).toBe(401);
  });

  it('chave do G7 acessa só /integracao (GET); /pedidos, /clientes e escrita retornam 403', async () => {
    expect((await request(app).get(`${BASE}/integracao/pedidos`).set(g7)).status).toBe(200);
    for (const rota of ['/pedidos', '/pedidos/101', '/clientes']) {
      const res = await request(app).get(`${BASE}${rota}`).set(g7);
      expect(res.status).toBe(403);
      expect(res.body.erro.codigo).toBe('SEM_PERMISSAO');
    }
    expect((await request(app).post(`${BASE}/integracao/pedidos`).set(g7).send({})).status).toBe(403);
  });

  it('rota inexistente: 404 com formato padrão', async () => {
    const res = await request(app).get(`${BASE}/nada`).set(admin);
    expect(res.status).toBe(404);
    expect(res.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});

describe('endpoint de integração (Contrato B)', () => {
  it('só CONFIRMADO/CANCELADO, com os campos exatos da view e sem itens', async () => {
    const res = await request(app).get(`${BASE}/integracao/pedidos`).set(g7);
    expect(res.status).toBe(200);
    expect(res.body.paginacao).toEqual({ pagina: 1, tamanho: 20, total_registros: 7, total_paginas: 1 });
    const ids = res.body.dados.map((p: { codigo_pedido: number }) => p.codigo_pedido);
    expect(ids).toEqual([101, 102, 103, 104, 105, 106, 107]); // 108 é ABERTO: não aparece
    expect(Object.keys(res.body.dados[0]).sort()).toEqual(
      [
        'codigo_pedido', 'codigo_cliente', 'nome_cliente', 'endereco_entrega', 'cidade_entrega', 'uf_entrega',
        'cep_entrega', 'data_pedido', 'quantidade_itens', 'valor_total', 'status_pedido', 'data_atualizacao',
      ].sort(),
    );
    expect(res.body.dados[0]).toMatchObject({
      codigo_pedido: 101,
      codigo_cliente: 1,
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
    });
    expect(res.body.dados[3].quantidade_itens).toBe(4); // pedido 104: 2 + 2
  });

  it('pedido cancelado continua na view (nunca some) e pedido novo confirmado aparece', async () => {
    await status(101, 'CANCELADO');
    const novo = await criarPedido();
    await status(novo.codigo_pedido, 'CONFIRMADO');

    const res = await request(app).get(`${BASE}/integracao/pedidos?tamanho=100`).set(g7);
    const p101 = res.body.dados.find((p: { codigo_pedido: number }) => p.codigo_pedido === 101);
    expect(p101.status_pedido).toBe('CANCELADO');
    expect(res.body.dados.map((p: { codigo_pedido: number }) => p.codigo_pedido)).toContain(novo.codigo_pedido);
  });

  it('pagina e valida parâmetros', async () => {
    const res = await request(app).get(`${BASE}/integracao/pedidos?pagina=2&tamanho=3`).set(g7);
    expect(res.body.dados.map((p: { codigo_pedido: number }) => p.codigo_pedido)).toEqual([104, 105, 106]);
    expect(res.body.paginacao).toEqual({ pagina: 2, tamanho: 3, total_registros: 7, total_paginas: 3 });
    for (const q of ['pagina=0', 'tamanho=101', 'tamanho=abc']) {
      expect((await request(app).get(`${BASE}/integracao/pedidos?${q}`).set(g7)).status).toBe(400);
    }
  });

  it('data_atualizacao muda a cada alteração do pedido', async () => {
    const antes = (await request(app).get(`${BASE}/integracao/pedidos`).set(g7)).body.dados[0];
    await request(app)
      .put(`${BASE}/pedidos/101`)
      .set(admin)
      .send({ endereco_entrega: 'Rua 5, 10, Centro', cidade_entrega: 'Senador Canedo', uf_entrega: 'GO', cep_entrega: '75250000' });
    const depois = (await request(app).get(`${BASE}/integracao/pedidos`).set(g7)).body.dados[0];
    expect(depois.cidade_entrega).toBe('Senador Canedo');
    expect(Date.parse(depois.data_atualizacao)).toBeGreaterThan(Date.parse(antes.data_atualizacao));
  });
});

describe('clientes', () => {
  it('CRUD: cria, consulta, atualiza, lista e desativa (sem apagar)', async () => {
    const criado = await request(app).post(`${BASE}/clientes`).set(admin).send({ nome: 'Novo Cliente' });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({ nome: 'Novo Cliente', ativo: true });
    expect(criado.body.codigo_cliente).toBeGreaterThan(7);
    expect(criado.headers.location).toBe(`/api/v1/clientes/${criado.body.codigo_cliente}`);
    const id = criado.body.codigo_cliente;

    expect((await request(app).get(`${BASE}/clientes/${id}`).set(admin)).body.nome).toBe('Novo Cliente');
    const put = await request(app).put(`${BASE}/clientes/${id}`).set(admin).send({ nome: 'Renomeado', ativo: true });
    expect(put.body.nome).toBe('Renomeado');

    expect((await request(app).delete(`${BASE}/clientes/${id}`).set(admin)).status).toBe(204);
    expect((await request(app).get(`${BASE}/clientes/${id}`).set(admin)).body.ativo).toBe(false);

    const inativos = await request(app).get(`${BASE}/clientes?ativo=false`).set(admin);
    expect(inativos.body.dados).toHaveLength(1);
    expect((await request(app).get(`${BASE}/clientes?tamanho=3`).set(admin)).body.paginacao.total_registros).toBe(8);
  });

  it('cliente com pedido ABERTO ou CONFIRMADO não é desativado (409)', async () => {
    const res = await request(app).delete(`${BASE}/clientes/1`).set(admin);
    expect(res.status).toBe(409);
    expect(res.body.erro.codigo).toBe('OPERACAO_NAO_PERMITIDA');
    expect((await request(app).put(`${BASE}/clientes/1`).set(admin).send({ nome: 'João Silva', ativo: false })).status).toBe(409);
  });

  it('400 estrutura, 422 valor, 404 inexistente', async () => {
    expect((await request(app).post(`${BASE}/clientes`).set(admin).send({})).status).toBe(400);
    expect((await request(app).post(`${BASE}/clientes`).set(admin).send({ nome: '   ' })).status).toBe(422);
    expect((await request(app).get(`${BASE}/clientes/999`).set(admin)).status).toBe(404);
    expect((await request(app).get(`${BASE}/clientes/abc`).set(admin)).status).toBe(400);
  });
});

describe('POST /pedidos', () => {
  it('201 cria pedido ABERTO com total calculado e itens', async () => {
    const res = await request(app).post(`${BASE}/pedidos`).set(admin).send(novoPedido());
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/pedidos/${res.body.codigo_pedido}`);
    expect(res.body).toMatchObject({
      codigo_cliente: 1,
      nome_cliente: 'João Silva',
      status_pedido: 'ABERTO',
      quantidade_itens: 4,
      valor_total: 189.7,
    });
    expect(res.body.codigo_pedido).toBeGreaterThan(108);
    expect(res.body.itens).toHaveLength(2);
    expect(res.body.itens[0]).toMatchObject({ descricao: 'Camiseta básica', quantidade: 3, preco_unitario: 59.9 });
  });

  it('400: JSON malformado, Content-Type errado, campos ausentes e tipos errados', async () => {
    const malformado = await request(app).post(`${BASE}/pedidos`).set(admin).set('Content-Type', 'application/json').send('{"a":');
    expect(malformado.status).toBe(400);
    expect(malformado.body.erro.detalhes[0]).toMatchObject({ campo: 'body', problema: 'JSON malformado' });

    const texto = await request(app).post(`${BASE}/pedidos`).set(admin).set('Content-Type', 'text/plain').send('x');
    expect(texto.status).toBe(400);

    const corpo = novoPedido({ itens: [{ descricao: 'x', quantidade: '2', preco_unitario: 1 }] }) as Record<string, unknown>;
    delete corpo.cidade_entrega;
    const res = await request(app).post(`${BASE}/pedidos`).set(admin).send(corpo);
    expect(res.status).toBe(400);
    expect(res.body.erro.detalhes).toEqual(
      expect.arrayContaining([
        { campo: 'cidade_entrega', problema: 'campo obrigatório' },
        { campo: 'itens.0.quantidade', problema: 'tipo inválido (esperado número)' },
      ]),
    );
  });

  it.each([
    ['UF inexistente', { uf_entrega: 'XX' }, 'uf_entrega'],
    ['UF minúscula', { uf_entrega: 'go' }, 'uf_entrega'],
    ['CEP com 4 dígitos', { cep_entrega: '1234' }, 'cep_entrega'],
    ['CEP com traço', { cep_entrega: '74120-020' }, 'cep_entrega'],
    ['endereço vazio', { endereco_entrega: '  ' }, 'endereco_entrega'],
    ['endereço maior que 200', { endereco_entrega: 'R'.repeat(201) }, 'endereco_entrega'],
    ['sem itens', { itens: [] }, 'itens'],
    ['quantidade zero', { itens: [{ descricao: 'x', quantidade: 0, preco_unitario: 1 }] }, 'itens.0.quantidade'],
    ['preço negativo', { itens: [{ descricao: 'x', quantidade: 1, preco_unitario: -5 }] }, 'itens.0.preco_unitario'],
    ['preço com 3 casas', { itens: [{ descricao: 'x', quantidade: 1, preco_unitario: 1.234 }] }, 'itens.0.preco_unitario'],
    ['cliente inexistente', { codigo_cliente: 999 }, 'codigo_cliente'],
  ])('422: %s', async (_nome, alteracao, campo) => {
    const res = await request(app).post(`${BASE}/pedidos`).set(admin).send(novoPedido(alteracao));
    expect(res.status).toBe(422);
    expect(res.body.erro.codigo).toBe('VALIDACAO_SEMANTICA');
    expect(res.body.erro.detalhes.map((d: { campo: string }) => d.campo)).toContain(campo);
  });

  it('422 para cliente inativo', async () => {
    await pool.query('UPDATE cliente SET ativo = FALSE WHERE cliente_id = 5');
    await pool.query(`UPDATE pedido SET status = 'CANCELADO' WHERE cliente_id = 5`);
    const res = await request(app).post(`${BASE}/pedidos`).set(admin).send(novoPedido({ codigo_cliente: 5 }));
    expect(res.status).toBe(422);
  });
});

describe('consultas de pedidos', () => {
  it('lista com filtros e paginação; lista não traz itens', async () => {
    const todos = await request(app).get(`${BASE}/pedidos`).set(admin);
    expect(todos.body.paginacao.total_registros).toBe(8);
    expect(todos.body.dados[0]).not.toHaveProperty('itens');

    const abertos = await request(app).get(`${BASE}/pedidos?status_pedido=ABERTO`).set(admin);
    expect(abertos.body.dados.map((p: { codigo_pedido: number }) => p.codigo_pedido)).toEqual([108]);

    const doCliente = await request(app).get(`${BASE}/pedidos?codigo_cliente=1`).set(admin);
    expect(doCliente.body.dados.map((p: { codigo_pedido: number }) => p.codigo_pedido)).toEqual([101, 108]);

    for (const q of ['status_pedido=XYZ', 'codigo_cliente=0', 'pagina=0']) {
      expect((await request(app).get(`${BASE}/pedidos?${q}`).set(admin)).status).toBe(400);
    }
  });

  it('consulta por código traz itens; 404 e 400', async () => {
    const res = await request(app).get(`${BASE}/pedidos/104`).set(admin);
    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(2);
    expect(res.body.valor_total).toBe(320.5);
    expect((await request(app).get(`${BASE}/pedidos/9999`).set(admin)).status).toBe(404);
    expect((await request(app).get(`${BASE}/pedidos/abc`).set(admin)).status).toBe(400);
  });
});

describe('PUT /pedidos/{id}', () => {
  const endereco = { endereco_entrega: 'Rua Nova, 99', cidade_entrega: 'Anápolis', uf_entrega: 'GO', cep_entrega: '75024050' };

  it('altera o endereço de pedido CONFIRMADO, mas não os itens (409)', async () => {
    const ok = await request(app).put(`${BASE}/pedidos/101`).set(admin).send(endereco);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ...endereco, status_pedido: 'CONFIRMADO' });

    const itens = await request(app)
      .put(`${BASE}/pedidos/101`)
      .set(admin)
      .send({ ...endereco, itens: [{ descricao: 'x', quantidade: 1, preco_unitario: 1 }] });
    expect(itens.status).toBe(409);
    expect(itens.body.erro.codigo).toBe('OPERACAO_NAO_PERMITIDA');
  });

  it('pedido ABERTO: substitui itens e recalcula o total', async () => {
    const res = await request(app)
      .put(`${BASE}/pedidos/108`)
      .set(admin)
      .send({ ...endereco, itens: [{ descricao: 'Mochila', quantidade: 2, preco_unitario: 100.5 }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valor_total: 201, quantidade_itens: 2 });
    expect(res.body.itens).toHaveLength(1);
  });

  it('409 em pedido CANCELADO; 404; 400 sem endereço; 422 para troca de cliente', async () => {
    await status(102, 'CANCELADO');
    expect((await request(app).put(`${BASE}/pedidos/102`).set(admin).send(endereco)).status).toBe(409);
    expect((await request(app).put(`${BASE}/pedidos/999`).set(admin).send(endereco)).status).toBe(404);
    expect((await request(app).put(`${BASE}/pedidos/101`).set(admin).send({})).status).toBe(400);
    expect((await request(app).put(`${BASE}/pedidos/101`).set(admin).send({ ...endereco, codigo_cliente: 2 })).status).toBe(422);
    expect((await request(app).put(`${BASE}/pedidos/101`).set(admin).send({ ...endereco, uf_entrega: 'XX' })).status).toBe(422);
  });
});

describe('PATCH /pedidos/{id}/status e DELETE', () => {
  it('ABERTO -> CONFIRMADO -> CANCELADO; CANCELADO é final', async () => {
    const { codigo_pedido: id } = await criarPedido();
    expect((await status(id, 'CONFIRMADO')).body.status_pedido).toBe('CONFIRMADO');
    expect((await status(id, 'CANCELADO')).body.status_pedido).toBe('CANCELADO');
    const final = await status(id, 'CONFIRMADO');
    expect(final.status).toBe(409);
    expect(final.body.erro.codigo).toBe('TRANSICAO_INVALIDA');
  });

  it('409 para voltar a ABERTO ou repetir status; 422 para valor fora do enum; 400/404', async () => {
    expect((await status(101, 'ABERTO')).status).toBe(409);
    expect((await status(101, 'CONFIRMADO')).status).toBe(409);
    expect((await status(101, 'VOANDO')).status).toBe(422);
    expect((await request(app).patch(`${BASE}/pedidos/101/status`).set(admin).send({})).status).toBe(400);
    expect((await status(9999, 'CANCELADO')).status).toBe(404);
  });

  it('DELETE só em pedido ABERTO: 204 e depois 404; CONFIRMADO retorna 409', async () => {
    expect((await request(app).delete(`${BASE}/pedidos/108`).set(admin)).status).toBe(204);
    expect((await request(app).get(`${BASE}/pedidos/108`).set(admin)).status).toBe(404);
    const confirmado = await request(app).delete(`${BASE}/pedidos/101`).set(admin);
    expect(confirmado.status).toBe(409);
    expect(confirmado.body.erro.codigo).toBe('OPERACAO_NAO_PERMITIDA');
    expect((await request(app).delete(`${BASE}/pedidos/0`).set(admin)).status).toBe(400);
  });
});
