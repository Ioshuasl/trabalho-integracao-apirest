import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/shared/database/pool';
import { hoje } from '../src/shared/datetime';
import { CHAVE_ESCRITA, CHAVE_LEITURA } from './test-env';

const app = createApp();
const BASE = '/api/v1';

const escrita = { 'X-API-Key': CHAVE_ESCRITA };
const leitura = { 'X-API-Key': CHAVE_LEITURA };

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const futura = () => somarDias(hoje(), 7);

function novaEntrega(sobrescrever: Record<string, unknown> = {}) {
  return {
    id_pedido: 5012,
    id_cliente: 1034,
    nome_destinatario: 'Maria Souza',
    transportadora: 'Correios',
    endereco_destino: {
      logradouro: 'Rua das Flores',
      numero: '120',
      complemento: 'Apto 32',
      bairro: 'Centro',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13010-100',
    },
    data_prevista: futura(),
    valor_frete: 25.9,
    ...sobrescrever,
  };
}

async function criar(sobrescrever: Record<string, unknown> = {}) {
  const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(novaEntrega(sobrescrever));
  expect(res.status).toBe(201);
  return res.body as { id_entrega: number };
}

const patchStatus = (id: number, corpo: Record<string, unknown>) =>
  request(app).patch(`${BASE}/entregas/${id}/status`).set(escrita).send(corpo);

beforeEach(async () => {
  await pool.query('TRUNCATE entregas, entregas_historico, pedidos_importados, integracao_logs RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('health', () => {
  it('responde 200 UP sem X-API-Key', async () => {
    const res = await request(app).get(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'UP' });
  });
});

describe('autenticação e autorização', () => {
  it('401 sem chave, com formato de erro padrão e request_id', async () => {
    const res = await request(app).get(`${BASE}/entregas`);
    expect(res.status).toBe(401);
    expect(res.body.erro).toMatchObject({ status: 401, codigo: 'NAO_AUTENTICADO', detalhes: [] });
    expect(res.body.caminho).toBe('/api/v1/entregas');
    expect(res.body.request_id).toBe(res.headers['x-request-id']);
  });

  it('401 com chave inválida', async () => {
    const res = await request(app).get(`${BASE}/entregas`).set('X-API-Key', 'errada');
    expect(res.status).toBe(401);
  });

  it('chave somente leitura: GET ok, POST/PUT/PATCH/DELETE retornam 403', async () => {
    const { id_entrega } = await criar();
    expect((await request(app).get(`${BASE}/entregas`).set(leitura)).status).toBe(200);

    const alvo = `${BASE}/entregas/${id_entrega}`;
    for (const res of [
      await request(app).post(`${BASE}/entregas`).set(leitura).send(novaEntrega()),
      await request(app).put(alvo).set(leitura).send(novaEntrega()),
      await request(app).patch(`${alvo}/status`).set(leitura).send({ status_entrega: 'EM_TRANSITO' }),
      await request(app).delete(alvo).set(leitura),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.erro.codigo).toBe('SEM_PERMISSAO');
    }
  });

  it('devolve o X-Request-Id enviado pelo consumidor', async () => {
    const id = '3f6c1e2a-8b7d-4c11-9a52-0e4b7d9f1a23';
    const res = await request(app).get(`${BASE}/entregas`).set(escrita).set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });
});

describe('rotas inexistentes', () => {
  it('404 com formato padrão', async () => {
    const res = await request(app).get(`${BASE}/inexistente`).set(escrita);
    expect(res.status).toBe(404);
    expect(res.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});

describe('POST /entregas', () => {
  it('201 com id, código de rastreio, status inicial, Location e histórico', async () => {
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(novaEntrega());
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/entregas/${res.body.id_entrega}`);
    expect(res.body).toMatchObject({
      id_entrega: 1,
      id_pedido: 5012,
      valor_frete: 25.9,
      status_entrega: 'AGUARDANDO_COLETA',
      data_entrega: null,
    });
    expect(res.body.codigo_rastreio).toMatch(/^ENT-\d{4}-000001$/);
    expect(res.body.data_criacao).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/);

    const hist = await request(app).get(`${BASE}/entregas/1/historico`).set(escrita);
    expect(hist.body.dados).toHaveLength(1);
    expect(hist.body.dados[0]).toMatchObject({ status_entrega: 'AGUARDANDO_COLETA', observacao: null });
  });

  it('ignora status, id e campos desconhecidos enviados no corpo', async () => {
    const res = await request(app)
      .post(`${BASE}/entregas`)
      .set(escrita)
      .send(novaEntrega({ id_entrega: 99, status_entrega: 'ENTREGUE', campo_novo: 'x' }));
    expect(res.status).toBe(201);
    expect(res.body.id_entrega).toBe(1);
    expect(res.body.status_entrega).toBe('AGUARDANDO_COLETA');
    expect(res.body).not.toHaveProperty('campo_novo');
  });

  it('400 com Content-Type diferente de JSON', async () => {
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).set('Content-Type', 'text/plain').send('x');
    expect(res.status).toBe(400);
    expect(res.body.erro.detalhes[0].campo).toBe('Content-Type');
  });

  it('400 com JSON malformado', async () => {
    const res = await request(app)
      .post(`${BASE}/entregas`)
      .set(escrita)
      .set('Content-Type', 'application/json')
      .send('{"id_pedido": ');
    expect(res.status).toBe(400);
    expect(res.body.erro.codigo).toBe('REQUISICAO_INVALIDA');
    expect(res.body.erro.detalhes[0]).toMatchObject({ campo: 'body', problema: 'JSON malformado' });
  });

  it('400 com campos obrigatórios ausentes e tipos errados, listando cada campo', async () => {
    const corpo = novaEntrega({ valor_frete: 'caro' }) as Record<string, unknown>;
    delete corpo.id_cliente;
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(corpo);
    expect(res.status).toBe(400);
    expect(res.body.erro.detalhes).toEqual(
      expect.arrayContaining([
        { campo: 'id_cliente', problema: 'campo obrigatório' },
        { campo: 'valor_frete', problema: 'tipo inválido (esperado número)' },
      ]),
    );
  });

  it('422 para data no passado e UF inexistente, com detalhes por campo', async () => {
    const corpo = novaEntrega({ data_prevista: '2020-01-01' });
    (corpo.endereco_destino as Record<string, unknown>).uf = 'XX';
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(corpo);
    expect(res.status).toBe(422);
    expect(res.body.erro.codigo).toBe('VALIDACAO_SEMANTICA');
    expect(res.body.erro.detalhes).toEqual(
      expect.arrayContaining([
        { campo: 'data_prevista', problema: `não pode ser anterior a ${hoje()}` },
        { campo: 'endereco_destino.uf', problema: "UF 'XX' inexistente" },
      ]),
    );
  });

  it.each([
    ['data fora do formato', { data_prevista: '10/12/2026' }, 'data_prevista'],
    ['frete negativo', { valor_frete: -1 }, 'valor_frete'],
    ['frete com 3 casas decimais', { valor_frete: 10.123 }, 'valor_frete'],
    ['frete acima do máximo', { valor_frete: 10000 }, 'valor_frete'],
    ['nome só com espaços', { nome_destinatario: '     ' }, 'nome_destinatario'],
    ['nome curto demais', { nome_destinatario: 'Jo' }, 'nome_destinatario'],
    ['id_pedido zero', { id_pedido: 0 }, 'id_pedido'],
  ])('422: %s', async (_nome, alteracao, campo) => {
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(novaEntrega(alteracao));
    expect(res.status).toBe(422);
    expect(res.body.erro.detalhes.map((d: { campo: string }) => d.campo)).toContain(campo);
  });

  it('422 para CEP fora do padrão e UF minúscula', async () => {
    const corpo = novaEntrega();
    Object.assign(corpo.endereco_destino, { cep: '13010100', uf: 'sp' });
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(corpo);
    expect(res.status).toBe(422);
    const campos = res.body.erro.detalhes.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['endereco_destino.cep', 'endereco_destino.uf']));
  });

  it('409 ao cadastrar segunda entrega ativa para o mesmo pedido', async () => {
    await criar();
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(novaEntrega());
    expect(res.status).toBe(409);
    expect(res.body.erro.codigo).toBe('ENTREGA_DUPLICADA');
  });

  it('permite nova entrega para o pedido depois de cancelada a anterior', async () => {
    const { id_entrega } = await criar();
    expect((await patchStatus(id_entrega, { status_entrega: 'CANCELADA' })).status).toBe(200);
    const res = await request(app).post(`${BASE}/entregas`).set(escrita).send(novaEntrega());
    expect(res.status).toBe(201);
  });

  it('apenas uma de duas requisições simultâneas cria a entrega (a outra recebe 409)', async () => {
    const resultados = await Promise.all(
      [1, 2, 3, 4].map(() => request(app).post(`${BASE}/entregas`).set(escrita).send(novaEntrega())),
    );
    const status = resultados.map((r) => r.status).sort();
    expect(status).toEqual([201, 409, 409, 409]);
  });
});

describe('GET /entregas e /entregas/{id}', () => {
  it('lista vazia retorna 200 com paginação zerada', async () => {
    const res = await request(app).get(`${BASE}/entregas`).set(escrita);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      dados: [],
      paginacao: { pagina: 1, tamanho: 20, total_registros: 0, total_paginas: 0 },
    });
  });

  it('filtra por id_pedido e status e pagina', async () => {
    await criar({ id_pedido: 1 });
    await criar({ id_pedido: 2 });
    const terceira = await criar({ id_pedido: 3 });
    await patchStatus(terceira.id_entrega, { status_entrega: 'EM_TRANSITO' });

    const porPedido = await request(app).get(`${BASE}/entregas?id_pedido=2`).set(escrita);
    expect(porPedido.body.dados).toHaveLength(1);
    expect(porPedido.body.dados[0].id_pedido).toBe(2);

    const porStatus = await request(app).get(`${BASE}/entregas?status_entrega=EM_TRANSITO`).set(escrita);
    expect(porStatus.body.paginacao.total_registros).toBe(1);

    const pagina = await request(app).get(`${BASE}/entregas?pagina=2&tamanho=2`).set(escrita);
    expect(pagina.body.dados).toHaveLength(1);
    expect(pagina.body.paginacao).toEqual({ pagina: 2, tamanho: 2, total_registros: 3, total_paginas: 2 });
  });

  it.each(['pagina=0', 'tamanho=101', 'tamanho=abc', 'id_pedido=-1', 'status_entrega=INEXISTENTE'])(
    '400 para query inválida: %s',
    async (query) => {
      const res = await request(app).get(`${BASE}/entregas?${query}`).set(escrita);
      expect(res.status).toBe(400);
      expect(res.body.erro.detalhes.length).toBeGreaterThan(0);
    },
  );

  it('consulta por id: 200, 404 e 400', async () => {
    const { id_entrega } = await criar();
    expect((await request(app).get(`${BASE}/entregas/${id_entrega}`).set(escrita)).status).toBe(200);
    expect((await request(app).get(`${BASE}/entregas/9999`).set(escrita)).status).toBe(404);
    const invalido = await request(app).get(`${BASE}/entregas/abc`).set(escrita);
    expect(invalido.status).toBe(400);
    expect(invalido.body.erro.detalhes[0].campo).toBe('id_entrega');
  });
});

describe('PUT /entregas/{id}', () => {
  const corpoPut = (sobrescrever: Record<string, unknown> = {}) => {
    const { id_pedido: _p, id_cliente: _c, ...editaveis } = novaEntrega();
    return { ...editaveis, nome_destinatario: 'Maria Souza Lima', ...sobrescrever };
  };

  it('200 atualiza os campos editáveis e mantém o status', async () => {
    const { id_entrega } = await criar();
    const res = await request(app).put(`${BASE}/entregas/${id_entrega}`).set(escrita).send(corpoPut());
    expect(res.status).toBe(200);
    expect(res.body.nome_destinatario).toBe('Maria Souza Lima');
    expect(res.body.status_entrega).toBe('AGUARDANDO_COLETA');
  });

  it('aceita id_pedido igual ao gravado e ignora campos somente leitura', async () => {
    const { id_entrega } = await criar();
    const res = await request(app)
      .put(`${BASE}/entregas/${id_entrega}`)
      .set(escrita)
      .send(corpoPut({ id_pedido: 5012, codigo_rastreio: 'ENT-0000-000000', id_entrega: 77 }));
    expect(res.status).toBe(200);
    expect(res.body.id_entrega).toBe(id_entrega);
    expect(res.body.codigo_rastreio).not.toBe('ENT-0000-000000');
  });

  it('422 ao tentar alterar id_pedido, id_cliente ou status', async () => {
    const { id_entrega } = await criar();
    const res = await request(app)
      .put(`${BASE}/entregas/${id_entrega}`)
      .set(escrita)
      .send(corpoPut({ id_pedido: 1, id_cliente: 2, status_entrega: 'ENTREGUE' }));
    expect(res.status).toBe(422);
    const campos = res.body.erro.detalhes.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['id_pedido', 'id_cliente', 'status_entrega']));
  });

  it('400 quando falta campo editável (substituição completa)', async () => {
    const { id_entrega } = await criar();
    const corpo = corpoPut() as Record<string, unknown>;
    delete corpo.valor_frete;
    const res = await request(app).put(`${BASE}/entregas/${id_entrega}`).set(escrita).send(corpo);
    expect(res.status).toBe(400);
  });

  it('404 para entrega inexistente', async () => {
    const res = await request(app).put(`${BASE}/entregas/999`).set(escrita).send(corpoPut());
    expect(res.status).toBe(404);
  });

  it('409 quando o status não permite edição', async () => {
    const { id_entrega } = await criar();
    await patchStatus(id_entrega, { status_entrega: 'EM_TRANSITO' });
    await patchStatus(id_entrega, { status_entrega: 'SAIU_PARA_ENTREGA' });
    const res = await request(app).put(`${BASE}/entregas/${id_entrega}`).set(escrita).send(corpoPut());
    expect(res.status).toBe(409);
    expect(res.body.erro.codigo).toBe('OPERACAO_NAO_PERMITIDA');
  });

  it('data_prevista só é revalidada quando muda (entrega atrasada pode ser editada)', async () => {
    const { id_entrega } = await criar();
    await pool.query(`UPDATE entregas SET data_prevista = '2020-01-01' WHERE id_entrega = $1`, [id_entrega]);

    const mantendo = await request(app)
      .put(`${BASE}/entregas/${id_entrega}`)
      .set(escrita)
      .send(corpoPut({ data_prevista: '2020-01-01' }));
    expect(mantendo.status).toBe(200);

    const mudandoParaPassado = await request(app)
      .put(`${BASE}/entregas/${id_entrega}`)
      .set(escrita)
      .send(corpoPut({ data_prevista: '2020-02-02' }));
    expect(mudandoParaPassado.status).toBe(422);
  });
});

describe('PATCH /entregas/{id}/status', () => {
  it('percorre o fluxo completo até ENTREGUE e registra o histórico', async () => {
    const { id_entrega } = await criar();
    expect((await patchStatus(id_entrega, { status_entrega: 'EM_TRANSITO', observacao: 'Coletado na loja' })).status).toBe(200);
    expect((await patchStatus(id_entrega, { status_entrega: 'SAIU_PARA_ENTREGA' })).status).toBe(200);
    const final = await patchStatus(id_entrega, {
      status_entrega: 'ENTREGUE',
      data_entrega: hoje(),
      observacao: 'Recebido pela destinatária',
    });
    expect(final.status).toBe(200);
    expect(final.body).toMatchObject({ status_entrega: 'ENTREGUE', data_entrega: hoje() });

    const hist = await request(app).get(`${BASE}/entregas/${id_entrega}/historico`).set(escrita);
    expect(hist.body.dados.map((h: { status_entrega: string }) => h.status_entrega)).toEqual([
      'AGUARDANDO_COLETA',
      'EM_TRANSITO',
      'SAIU_PARA_ENTREGA',
      'ENTREGUE',
    ]);
    expect(hist.body.dados[1].observacao).toBe('Coletado na loja');
  });

  it('409 em transição fora da tabela, no mesmo status e a partir de status final', async () => {
    const { id_entrega } = await criar();
    const pulo = await patchStatus(id_entrega, { status_entrega: 'ENTREGUE', data_entrega: hoje() });
    expect(pulo.status).toBe(409);
    expect(pulo.body.erro.codigo).toBe('TRANSICAO_INVALIDA');

    expect((await patchStatus(id_entrega, { status_entrega: 'AGUARDANDO_COLETA' })).status).toBe(409);

    await patchStatus(id_entrega, { status_entrega: 'CANCELADA' });
    expect((await patchStatus(id_entrega, { status_entrega: 'EM_TRANSITO' })).status).toBe(409);
  });

  it('permite NAO_ENTREGUE -> SAIU_PARA_ENTREGA -> ENTREGUE e NAO_ENTREGUE -> DEVOLVIDA', async () => {
    const { id_entrega } = await criar();
    await patchStatus(id_entrega, { status_entrega: 'EM_TRANSITO' });
    await patchStatus(id_entrega, { status_entrega: 'SAIU_PARA_ENTREGA' });
    await patchStatus(id_entrega, { status_entrega: 'NAO_ENTREGUE' });
    expect((await patchStatus(id_entrega, { status_entrega: 'SAIU_PARA_ENTREGA' })).status).toBe(200);
    await patchStatus(id_entrega, { status_entrega: 'NAO_ENTREGUE' });
    expect((await patchStatus(id_entrega, { status_entrega: 'DEVOLVIDA' })).status).toBe(200);
  });

  it('422 para ENTREGUE sem data_entrega, com data futura, e data_entrega em outro status', async () => {
    const { id_entrega } = await criar();
    await patchStatus(id_entrega, { status_entrega: 'EM_TRANSITO' });
    const dataEmTransito = await patchStatus(id_entrega, { status_entrega: 'SAIU_PARA_ENTREGA', data_entrega: hoje() });
    expect(dataEmTransito.status).toBe(422);

    await patchStatus(id_entrega, { status_entrega: 'SAIU_PARA_ENTREGA' });
    const semData = await patchStatus(id_entrega, { status_entrega: 'ENTREGUE' });
    expect(semData.status).toBe(422);
    expect(semData.body.erro.detalhes[0].campo).toBe('data_entrega');

    const futura = await patchStatus(id_entrega, { status_entrega: 'ENTREGUE', data_entrega: somarDias(hoje(), 3) });
    expect(futura.status).toBe(422);

    // nada mudou: a entrega continua SAIU_PARA_ENTREGA
    const atual = await request(app).get(`${BASE}/entregas/${id_entrega}`).set(escrita);
    expect(atual.body.status_entrega).toBe('SAIU_PARA_ENTREGA');
  });

  it('422 para status fora do enum; 400 sem status ou com tipo errado; 404 inexistente', async () => {
    const { id_entrega } = await criar();
    expect((await patchStatus(id_entrega, { status_entrega: 'VOANDO' })).status).toBe(422);
    expect((await patchStatus(id_entrega, {})).status).toBe(400);
    expect((await patchStatus(id_entrega, { status_entrega: 3 })).status).toBe(400);
    expect((await patchStatus(9999, { status_entrega: 'EM_TRANSITO' })).status).toBe(404);
  });
});

describe('DELETE /entregas/{id}', () => {
  it('204 para entrega AGUARDANDO_COLETA e depois 404', async () => {
    const { id_entrega } = await criar();
    const res = await request(app).delete(`${BASE}/entregas/${id_entrega}`).set(escrita);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await request(app).get(`${BASE}/entregas/${id_entrega}`).set(escrita)).status).toBe(404);
    expect((await request(app).get(`${BASE}/entregas/${id_entrega}/historico`).set(escrita)).status).toBe(404);
    expect((await request(app).delete(`${BASE}/entregas/${id_entrega}`).set(escrita)).status).toBe(404);
  });

  it('409 depois de coletada (usar PATCH CANCELADA)', async () => {
    const { id_entrega } = await criar();
    await patchStatus(id_entrega, { status_entrega: 'EM_TRANSITO' });
    const res = await request(app).delete(`${BASE}/entregas/${id_entrega}`).set(escrita);
    expect(res.status).toBe(409);
    expect(res.body.erro.codigo).toBe('OPERACAO_NAO_PERMITIDA');
  });

  it('400 para id inválido', async () => {
    const res = await request(app).delete(`${BASE}/entregas/0`).set(escrita);
    expect(res.status).toBe(400);
  });
});

describe('GET /entregas/{id}/historico', () => {
  it('400 para id inválido e 404 para inexistente', async () => {
    expect((await request(app).get(`${BASE}/entregas/x/historico`).set(escrita)).status).toBe(400);
    expect((await request(app).get(`${BASE}/entregas/5/historico`).set(escrita)).status).toBe(404);
  });
});
