import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ClienteG5Http, registrarOcorrencia } from '../src/modules/integracao-pedidos';
import { pool } from '../src/shared/database/pool';
import { hoje } from '../src/shared/datetime';
import { iniciarFakeG5, pedidoG5, type FakeG5 } from './fake-g5';
import { CHAVE_ESCRITA, CHAVE_LEITURA } from './test-env';

const BASE = '/api/v1';
const escrita = { 'X-API-Key': CHAVE_ESCRITA };
const leitura = { 'X-API-Key': CHAVE_LEITURA };

let g5: FakeG5;

function criarApp(sobrescrever: { apiKey?: string; baseUrl?: string } = {}) {
  const cliente = new ClienteG5Http(
    {
      baseUrl: sobrescrever.baseUrl ?? g5.url,
      apiKey: sobrescrever.apiKey ?? 'g7-entregas-leitura-2026',
      timeoutMs: 300,
      retryDelaysMs: [5, 5, 5],
    },
    registrarOcorrencia,
  );
  return createApp({ clienteG5: cliente });
}

const importar = (app: ReturnType<typeof criarApp>) => request(app).post(`${BASE}/integracoes/pedidos/importar`).set(escrita);

const logs = async (tipo?: string) => {
  const { rows } = await pool.query(
    `SELECT * FROM integracao_logs ${tipo ? 'WHERE tipo_ocorrencia = $1' : ''} ORDER BY id_log`,
    tipo ? [tipo] : [],
  );
  return rows;
};

const entregaDoPedido = async (codigo: number) =>
  (await pool.query('SELECT * FROM entregas WHERE id_pedido = $1 ORDER BY id_entrega DESC', [codigo])).rows[0];

const patchStatus = (app: ReturnType<typeof criarApp>, id: number, status_entrega: string) =>
  request(app).patch(`${BASE}/entregas/${id}/status`).set(escrita).send({ status_entrega });

const MAIS_NOVO = '2026-10-20T10:00:00.000-03:00';

beforeAll(async () => {
  g5 = await iniciarFakeG5();
});

afterAll(async () => {
  await g5.fechar();
  await pool.end();
});

beforeEach(async () => {
  g5.pedidos = [];
  g5.falhas = [];
  g5.requisicoes = [];
  await pool.query('TRUNCATE entregas, entregas_historico, pedidos_importados, integracao_logs RESTART IDENTITY CASCADE');
});

describe('inclusão: pedido CONFIRMADO novo cria a entrega', () => {
  it('cria a entrega só com o que o G5 fornece e marca o restante como pendência', async () => {
    g5.pedidos = [pedidoG5(101), pedidoG5(102, { status_pedido: 'CANCELADO' })];
    const res = await importar(criarApp());

    expect(res.status).toBe(200);
    expect(res.body.consultados).toBe(2);
    expect(res.body.inseridos).toHaveLength(1);
    expect(res.body.inseridos[0]).toMatchObject({
      codigo_pedido: 101,
      pendencias: ['transportadora', 'endereco_destino.numero', 'endereco_destino.bairro', 'data_prevista', 'valor_frete'],
    });
    expect(res.body.ignorados).toEqual([expect.objectContaining({ codigo_pedido: 102 })]);
    expect(g5.requisicoes[0]).toMatchObject({
      caminho: '/api/v1/integracao/pedidos?pagina=1&tamanho=100',
      chave: 'g7-entregas-leitura-2026',
    });
    expect(g5.requisicoes[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const entrega = await request(criarApp()).get(`${BASE}/entregas/${res.body.inseridos[0].id_entrega}`).set(escrita);
    expect(entrega.body).toMatchObject({
      id_pedido: 101,
      id_cliente: 101,
      origem: 'PEDIDOS_G5',
      status_entrega: 'AGUARDANDO_COLETA',
      nome_destinatario: 'João Silva',
      transportadora: null,
      data_prevista: null,
      valor_frete: null,
      endereco_destino: {
        logradouro: 'Rua 10, 250, Setor Oeste',
        numero: null,
        bairro: null,
        cidade: 'Goiânia',
        uf: 'GO',
        cep: '74120-020',
      },
    });
    const hist = await request(criarApp()).get(`${BASE}/entregas/${entrega.body.id_entrega}/historico`).set(escrita);
    expect(hist.body.dados[0].observacao).toBe('Importada do pedido 101 do G5');

    const salvo = await pool.query('SELECT * FROM pedidos_importados');
    expect(salvo.rows).toHaveLength(1);
    expect(salvo.rows[0]).toMatchObject({ codigo_pedido: 101, status_pedido: 'CONFIRMADO', id_entrega: entrega.body.id_entrega });
  });

  it('é idempotente: reexecutar não duplica e conta como sem alteração', async () => {
    g5.pedidos = [pedidoG5(101), pedidoG5(103)];
    const app = criarApp();
    await importar(app);
    const segunda = await importar(app);

    expect(segunda.body.inseridos).toEqual([]);
    expect(segunda.body.sem_alteracao).toEqual([101, 103]);
    expect((await pool.query('SELECT 1 FROM entregas')).rowCount).toBe(2);
  });

  it('lê todas as páginas da API do G5', async () => {
    g5.pedidos = Array.from({ length: 120 }, (_, i) => pedidoG5(1000 + i));
    const res = await importar(criarApp());
    expect(res.body.inseridos).toHaveLength(120);
    expect(g5.requisicoes.map((r) => r.caminho)).toEqual([
      '/api/v1/integracao/pedidos?pagina=1&tamanho=100',
      '/api/v1/integracao/pedidos?pagina=2&tamanho=100',
    ]);
  });

  it('importações simultâneas criam cada entrega uma única vez', async () => {
    g5.pedidos = [pedidoG5(101), pedidoG5(103)];
    const app = criarApp();
    await Promise.all([importar(app), importar(app), importar(app)]);
    expect((await pool.query('SELECT 1 FROM entregas')).rowCount).toBe(2);
    expect((await pool.query('SELECT 1 FROM pedidos_importados')).rowCount).toBe(2);
  });

  it('normaliza UF minúscula e espaços nas pontas', async () => {
    g5.pedidos = [pedidoG5(101, { endereco_entrega: '  Rua 9, 45, Centro  ', cidade_entrega: '  Itumbiara ', uf_entrega: 'go' })];
    const res = await importar(criarApp());
    const e = await request(criarApp()).get(`${BASE}/entregas/${res.body.inseridos[0].id_entrega}`).set(escrita);
    expect(e.body.endereco_destino).toMatchObject({ logradouro: 'Rua 9, 45, Centro', cidade: 'Itumbiara', uf: 'GO' });
  });

  it('CANCELADO que nunca chegou confirmado é ignorado, sem erro', async () => {
    g5.pedidos = [pedidoG5(210, { status_pedido: 'CANCELADO' })];
    const res = await importar(criarApp());
    expect(res.body.ignorados).toHaveLength(1);
    expect(res.body.rejeitados).toEqual([]);
    expect((await pool.query('SELECT 1 FROM entregas')).rowCount).toBe(0);
    expect((await logs('IGNORADO'))).toHaveLength(1);
  });
});

describe('validação dos dados do G5 (Contrato B)', () => {
  it('rejeita cada pedido inválido com o tipo de erro certo e importa os válidos', async () => {
    const semEndereco = pedidoG5(208) as Record<string, unknown>;
    semEndereco.endereco_entrega = null;
    const semCidade = pedidoG5(211) as Record<string, unknown>;
    delete semCidade.cidade_entrega;

    g5.pedidos = [
      pedidoG5(201),
      pedidoG5(205, { uf_entrega: 'XX' }),
      pedidoG5(206, { cep_entrega: '1234' }),
      pedidoG5(207, { quantidade_itens: 0 }),
      semEndereco,
      pedidoG5(209, { data_pedido: '2030-01-15T10:00:00.000-03:00' }),
      pedidoG5(212, { valor_total: -10 }),
      pedidoG5(213, { quantidade_itens: '3' }),
      pedidoG5(214, { status_pedido: 'ABERTO' }),
      semCidade,
    ];
    const res = await importar(criarApp());

    expect(res.status).toBe(200);
    expect(res.body.inseridos.map((i: { codigo_pedido: number }) => i.codigo_pedido)).toEqual([201]);
    const por = (codigo: number) => res.body.rejeitados.find((r: { codigo_pedido: number }) => r.codigo_pedido === codigo);
    expect(por(205)).toMatchObject({ tipo_erro: 'VALOR_INVALIDO', campo: 'uf_entrega' });
    expect(por(206)).toMatchObject({ tipo_erro: 'VALOR_INVALIDO', campo: 'cep_entrega' });
    expect(por(207)).toMatchObject({ tipo_erro: 'VALOR_INVALIDO', campo: 'quantidade_itens' });
    expect(por(208)).toMatchObject({ tipo_erro: 'CAMPO_OBRIGATORIO', campo: 'endereco_entrega' });
    expect(por(209)).toMatchObject({ tipo_erro: 'VALOR_INVALIDO', campo: 'data_pedido' });
    expect(por(212)).toMatchObject({ tipo_erro: 'VALOR_INVALIDO', campo: 'valor_total' });
    expect(por(213)).toMatchObject({ tipo_erro: 'TIPO_INVALIDO', campo: 'quantidade_itens' });
    expect(por(214)).toMatchObject({ tipo_erro: 'VALOR_INVALIDO', campo: 'status_pedido' });
    expect(por(211)).toMatchObject({ tipo_erro: 'CAMPO_OBRIGATORIO', campo: 'cidade_entrega' });
    expect(await logs('VIOLACAO_CONTRATO')).toHaveLength(9);
    expect((await pool.query('SELECT 1 FROM entregas')).rowCount).toBe(1);
  });

  it('pedido rejeitado volta a ser lido: depois que o G5 corrige, ele entra', async () => {
    g5.pedidos = [pedidoG5(205, { uf_entrega: 'XX' })];
    const app = criarApp();
    expect((await importar(app)).body.rejeitados).toHaveLength(1);

    g5.pedidos = [pedidoG5(205, { uf_entrega: 'GO', data_atualizacao: MAIS_NOVO })];
    const res = await importar(app);
    expect(res.body.rejeitados).toEqual([]);
    expect(res.body.inseridos).toHaveLength(1);
  });

  it('rejeita todas as cópias de um codigo_pedido repetido na leitura (REGISTRO_DUPLICADO)', async () => {
    g5.pedidos = [pedidoG5(101), pedidoG5(101, { cidade_entrega: 'Outra' }), pedidoG5(102)];
    const res = await importar(criarApp());
    expect(res.body.rejeitados).toEqual([expect.objectContaining({ codigo_pedido: 101, tipo_erro: 'REGISTRO_DUPLICADO' })]);
    expect(res.body.inseridos.map((i: { codigo_pedido: number }) => i.codigo_pedido)).toEqual([102]);
    expect(await logs('REGISTRO_DUPLICADO')).toHaveLength(1);
  });

  it('registra conflito quando já existe entrega ativa com o mesmo id_pedido', async () => {
    await pool.query(
      `INSERT INTO entregas (codigo_rastreio, id_pedido, nome_destinatario, logradouro, cidade, uf, cep)
       VALUES ('ENT-2026-999999', 101, 'Outro', 'Rua B', 'X', 'SP', '01000-000')`,
    );
    g5.pedidos = [pedidoG5(101), pedidoG5(102)];
    const res = await importar(criarApp());
    expect(res.body.inseridos.map((i: { codigo_pedido: number }) => i.codigo_pedido)).toEqual([102]);
    expect(res.body.rejeitados).toEqual([expect.objectContaining({ codigo_pedido: 101 })]);
    expect((await pool.query('SELECT 1 FROM pedidos_importados WHERE codigo_pedido = 101')).rowCount).toBe(0);
    expect(await logs('CONFLITO')).toHaveLength(1);
  });
});

describe('atualização e cancelamento', () => {
  it('data_atualizacao mais recente atualiza o endereço da entrega ainda editável', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    await importar(app);

    g5.pedidos = [
      pedidoG5(101, { endereco_entrega: 'Rua 5, 10, Centro', cidade_entrega: 'Senador Canedo', cep_entrega: '75250000', data_atualizacao: MAIS_NOVO }),
    ];
    const res = await importar(app);
    expect(res.body.atualizados).toEqual([{ codigo_pedido: 101, acao: 'ENDERECO_ATUALIZADO' }]);
    const e = await entregaDoPedido(101);
    expect(e).toMatchObject({ logradouro: 'Rua 5, 10, Centro', cidade: 'Senador Canedo', cep: '75250-000' });

    // mesma data_atualizacao: sem alteração
    expect((await importar(app)).body.sem_alteracao).toEqual([101]);
  });

  it('atualização preserva o que o G7 já completou via PUT', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);
    const id = body.inseridos[0].id_entrega;
    await request(app).put(`${BASE}/entregas/${id}`).set(escrita).send({
      nome_destinatario: 'João Silva',
      transportadora: 'Correios',
      endereco_destino: { logradouro: 'Rua 10', numero: '250', bairro: 'Setor Oeste', cidade: 'Goiânia', uf: 'GO', cep: '74120-020' },
      data_prevista: `${hoje().slice(0, 4)}-12-31`,
      valor_frete: 15,
    });

    g5.pedidos = [pedidoG5(101, { cidade_entrega: 'Anápolis', data_atualizacao: MAIS_NOVO })];
    await importar(app);
    const e = await entregaDoPedido(101);
    expect(e).toMatchObject({ cidade: 'Anápolis', transportadora: 'Correios', numero: '250', bairro: 'Setor Oeste' });
  });

  it('data_atualizacao mais antiga que a gravada é rejeitada (REGRA_NEGOCIO)', async () => {
    g5.pedidos = [pedidoG5(101, { data_atualizacao: MAIS_NOVO })];
    const app = criarApp();
    await importar(app);
    g5.pedidos = [pedidoG5(101, { cidade_entrega: 'Outra', data_atualizacao: '2026-10-19T09:05:00.000-03:00' })];
    const res = await importar(app);
    expect(res.body.rejeitados).toEqual([expect.objectContaining({ codigo_pedido: 101, tipo_erro: 'REGRA_NEGOCIO' })]);
    expect((await entregaDoPedido(101)).cidade).toBe('Goiânia');
  });

  it('endereço alterado com a entrega em andamento: rejeitado para tratamento manual, e continua pendente', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);
    const id = body.inseridos[0].id_entrega;
    await patchStatus(app, id, 'EM_TRANSITO');
    await patchStatus(app, id, 'SAIU_PARA_ENTREGA');

    g5.pedidos = [pedidoG5(101, { endereco_entrega: 'Rua Nova, 99', data_atualizacao: MAIS_NOVO })];
    const res = await importar(app);
    expect(res.body.rejeitados).toEqual([expect.objectContaining({ codigo_pedido: 101, tipo_erro: 'REGRA_NEGOCIO' })]);
    expect((await entregaDoPedido(101)).logradouro).toBe('Rua 10, 250, Setor Oeste');
    expect((await importar(app)).body.rejeitados).toHaveLength(1); // a mudança segue pendente
    expect(await logs('REGRA_NEGOCIO')).toHaveLength(2);
  });

  it('pedido CANCELADO no G5 cancela a entrega ainda não saída e registra no histórico', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);
    const id = body.inseridos[0].id_entrega;

    g5.pedidos = [pedidoG5(101, { status_pedido: 'CANCELADO', data_atualizacao: MAIS_NOVO })];
    const res = await importar(app);
    expect(res.body.atualizados).toEqual([{ codigo_pedido: 101, acao: 'ENTREGA_CANCELADA' }]);
    expect((await entregaDoPedido(101)).status_entrega).toBe('CANCELADA');
    const hist = await request(app).get(`${BASE}/entregas/${id}/historico`).set(escrita);
    expect(hist.body.dados.at(-1)).toMatchObject({ status_entrega: 'CANCELADA', observacao: 'Pedido cancelado no G5' });
    expect((await pool.query(`SELECT status_pedido FROM pedidos_importados WHERE codigo_pedido = 101`)).rows[0].status_pedido).toBe('CANCELADO');

    // reler o mesmo cancelamento não faz nada
    expect((await importar(app)).body.sem_alteracao).toEqual([101]);
  });

  it('pedido cancelado com a entrega já em rota: rejeitado para decisão manual, entrega intacta', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);
    const id = body.inseridos[0].id_entrega;
    await patchStatus(app, id, 'EM_TRANSITO');
    await patchStatus(app, id, 'SAIU_PARA_ENTREGA');

    g5.pedidos = [pedidoG5(101, { status_pedido: 'CANCELADO', data_atualizacao: MAIS_NOVO })];
    const res = await importar(app);
    expect(res.body.rejeitados).toEqual([expect.objectContaining({ codigo_pedido: 101, tipo_erro: 'REGRA_NEGOCIO' })]);
    expect((await entregaDoPedido(101)).status_entrega).toBe('SAIU_PARA_ENTREGA');
  });

  it('pedido CANCELADO não volta a CONFIRMADO', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    await importar(app);
    g5.pedidos = [pedidoG5(101, { status_pedido: 'CANCELADO', data_atualizacao: MAIS_NOVO })];
    await importar(app);
    g5.pedidos = [pedidoG5(101, { status_pedido: 'CONFIRMADO', data_atualizacao: '2026-10-21T10:00:00.000-03:00' })];
    const res = await importar(app);
    expect(res.body.rejeitados).toEqual([expect.objectContaining({ tipo_erro: 'REGRA_NEGOCIO' })]);
  });

  it('entrega excluída (DELETE) some de pedidos_importados e o pedido é importado de novo', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);
    expect((await request(app).delete(`${BASE}/entregas/${body.inseridos[0].id_entrega}`).set(escrita)).status).toBe(204);

    const res = await importar(app);
    expect(res.body.inseridos).toHaveLength(1);
  });
});

describe('completar pendências via PUT', () => {
  it('PUT preenche os campos pendentes e zera pendencias', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);
    const id = body.inseridos[0].id_entrega;

    const put = await request(app).put(`${BASE}/entregas/${id}`).set(escrita).send({
      nome_destinatario: 'João Silva',
      transportadora: 'Correios',
      endereco_destino: { logradouro: 'Rua 10', numero: '250', bairro: 'Setor Oeste', cidade: 'Goiânia', uf: 'GO', cep: '74120-020' },
      data_prevista: `${hoje().slice(0, 4)}-12-31`,
      valor_frete: 19.9,
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ id_cliente: 101, transportadora: 'Correios', valor_frete: 19.9, pendencias: [] });
  });
});

describe('falhas de comunicação com o G5', () => {
  it('repete após 503 e conclui; cada tentativa fica registrada', async () => {
    g5.pedidos = [pedidoG5(101)];
    g5.falhas = [{ status: 503 }, { status: 503 }];
    const res = await importar(criarApp());

    expect(res.status).toBe(200);
    expect(res.body.inseridos).toHaveLength(1);
    expect((await logs()).map((l) => [l.tentativa, l.tipo_ocorrencia])).toEqual([
      [1, 'INDISPONIVEL'],
      [2, 'INDISPONIVEL'],
      [3, 'SUCESSO'],
    ]);
  });

  it('desiste após esgotar as tentativas e responde 503 sem derrubar a API', async () => {
    g5.falhas = [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }];
    const app = criarApp();
    const res = await importar(app);

    expect(res.status).toBe(503);
    expect(res.body.erro.codigo).toBe('INTEGRACAO_INDISPONIVEL');
    expect(res.headers['retry-after']).toBeDefined();
    expect(await logs()).toHaveLength(4);
    expect((await request(app).get(`${BASE}/health`)).status).toBe(200);
  });

  it('G5 fora do ar (conexão recusada): 503 INTEGRACAO_INDISPONIVEL', async () => {
    const res = await importar(criarApp({ baseUrl: 'http://127.0.0.1:1/api/v1' }));
    expect(res.status).toBe(503);
    expect(res.body.erro.codigo).toBe('INTEGRACAO_INDISPONIVEL');
    expect((await logs()).every((l) => l.tipo_ocorrencia === 'INDISPONIVEL')).toBe(true);
  });

  it('timeout: repete e registra TIMEOUT', async () => {
    g5.pedidos = [pedidoG5(101)];
    g5.falhas = [{ atrasoMs: 600, corpo: '{}' }];
    const res = await importar(criarApp());
    expect(res.status).toBe(200);
    expect(res.body.inseridos).toHaveLength(1);
    expect((await logs())[0]).toMatchObject({ tipo_ocorrencia: 'TIMEOUT', tentativa: 1 });
  });

  it('500 é repetido uma vez só', async () => {
    g5.falhas = [{ status: 500 }, { status: 500 }, { status: 500 }];
    const res = await importar(criarApp());
    expect(res.status).toBe(502);
    expect(res.body.erro.codigo).toBe('INTEGRACAO_ERRO');
    expect(await logs()).toHaveLength(2);
  });

  it('401 do G5 não é repetido: 502 INTEGRACAO_AUTENTICACAO', async () => {
    const res = await importar(criarApp({ apiKey: 'chave-errada' }));
    expect(res.status).toBe(502);
    expect(res.body.erro.codigo).toBe('INTEGRACAO_AUTENTICACAO');
    const registros = await logs();
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ status_http: 401, erro_codigo: 'NAO_AUTENTICADO', tipo_ocorrencia: 'ERRO_HTTP', sistema: 'G5' });
  });

  it('corpo que não é JSON ou fora do formato combinado: violação de contrato (502)', async () => {
    g5.falhas = [{ status: 200, corpo: '<html>oops</html>' }];
    const naoJson = await importar(criarApp());
    expect(naoJson.status).toBe(502);
    expect(naoJson.body.erro.codigo).toBe('INTEGRACAO_CONTRATO_INVALIDO');

    g5.falhas = [{ status: 200, corpo: '[]' }];
    const formato = await importar(criarApp());
    expect(formato.status).toBe(502);
    expect(formato.body.erro.codigo).toBe('INTEGRACAO_CONTRATO_INVALIDO');
  });

  it('G5 cai na segunda página: a importação falha inteira (503), sem derrubar a API', async () => {
    g5.pedidos = Array.from({ length: 120 }, (_, i) => pedidoG5(1000 + i));
    g5.falhas = [{ corpo: JSON.stringify({ dados: g5.pedidos.slice(0, 100), paginacao: { total_paginas: 2 } }) }, { status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }];
    const res = await importar(criarApp());
    expect(res.status).toBe(503);
  });
});

describe('rotas internas de integração', () => {
  it('exigem chave de escrita para importar (403 com a de leitura) e 401 sem chave', async () => {
    const app = criarApp();
    expect((await request(app).post(`${BASE}/integracoes/pedidos/importar`).set(leitura)).status).toBe(403);
    expect((await request(app).post(`${BASE}/integracoes/pedidos/importar`)).status).toBe(401);
  });

  it('listam pedidos importados e logs, com filtro por importação', async () => {
    g5.pedidos = [pedidoG5(101)];
    const app = criarApp();
    const { body } = await importar(app);

    const lista = await request(app).get(`${BASE}/integracoes/pedidos`).set(leitura);
    expect(lista.status).toBe(200);
    expect(lista.body.dados[0]).toMatchObject({
      codigo_pedido: 101,
      status_pedido: 'CONFIRMADO',
      valor_total: 179.7,
      id_entrega: body.inseridos[0].id_entrega,
    });

    const log = await request(app).get(`${BASE}/integracoes/logs?importacao_id=${body.importacao_id}`).set(leitura);
    expect(log.status).toBe(200);
    expect(log.body.dados[0]).toMatchObject({
      metodo: 'GET',
      endpoint: '/integracao/pedidos?pagina=1&tamanho=100',
      status_http: 200,
      tipo_ocorrencia: 'SUCESSO',
      importacao_id: body.importacao_id,
    });

    expect((await request(app).get(`${BASE}/integracoes/logs?importacao_id=abc`).set(leitura)).status).toBe(400);
    expect((await request(app).get(`${BASE}/integracoes/logs?limite=0`).set(leitura)).status).toBe(400);
  });
});
