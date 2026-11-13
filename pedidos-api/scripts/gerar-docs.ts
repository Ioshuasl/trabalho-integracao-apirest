/*
 * Gera a documentação a partir de um único ponto de verdade (src/docs/openapi.ts):
 *   docs/openapi.json
 *   docs/postman/pedidos-g5.postman_collection.json (com testes automáticos)
 *   docs/postman/pedidos-g5-local.postman_environment.json
 * Uso: npm run docs:gerar
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openapi } from '../src/docs/openapi';

const raiz = path.resolve(__dirname, '..', 'docs');
mkdirSync(path.join(raiz, 'postman'), { recursive: true });

type Auth = 'admin' | 'g7' | 'nenhuma';

interface Opcoes {
  corpo?: unknown;
  corpoBruto?: string;
  auth?: Auth;
  descricao?: string;
  testes?: string[];
}

const STATUS = (codigo: number) => `pm.test('Status ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const ERRO = (codigo: string) =>
  `pm.test('erro.codigo = ${codigo}', () => { const j = pm.response.json(); pm.expect(j.erro.codigo).to.eql('${codigo}'); pm.expect(j.request_id).to.be.a('string'); });`;

function requisicao(nome: string, metodo: string, caminho: string, op: Opcoes = {}) {
  const auth = op.auth ?? 'admin';
  const header = [{ key: 'Accept', value: 'application/json' }, { key: 'X-Request-Id', value: '{{$guid}}' }];
  if (auth === 'admin') header.push({ key: 'X-API-Key', value: '{{apiKey}}' });
  if (auth === 'g7') header.push({ key: 'X-API-Key', value: '{{apiKeyG7}}' });
  const temCorpo = op.corpo !== undefined || op.corpoBruto !== undefined;
  if (temCorpo) header.push({ key: 'Content-Type', value: 'application/json' });
  return {
    name: nome,
    request: {
      method: metodo,
      header,
      ...(temCorpo
        ? { body: { mode: 'raw', raw: op.corpoBruto ?? JSON.stringify(op.corpo, null, 2), options: { raw: { language: 'json' } } } }
        : {}),
      url: `{{baseUrl}}${caminho}`,
      ...(op.descricao ? { description: op.descricao } : {}),
    },
    event: op.testes ? [{ listen: 'test', script: { type: 'text/javascript', exec: op.testes } }] : [],
  };
}

const pasta = (nome: string, item: unknown[], descricao?: string) => ({ name: nome, ...(descricao ? { description: descricao } : {}), item });

const pedido = (sobrescrever: Record<string, unknown> = {}) => ({
  codigo_cliente: 2,
  endereco_entrega: 'Av. Brasil, 1200, Centro',
  cidade_entrega: 'Anápolis',
  uf_entrega: 'GO',
  cep_entrega: '75024050',
  itens: [
    { descricao: 'Caneca térmica', quantidade: 2, preco_unitario: 89.9 },
    { descricao: 'Livro', quantidade: 1, preco_unitario: 59.9 },
  ],
  ...sobrescrever,
});

const novoEndereco = { endereco_entrega: 'Rua Nova, 99, Jardim Luz', cidade_entrega: 'Goiânia', uf_entrega: 'GO', cep_entrega: '74120020' };

const colecao = {
  info: {
    name: 'API de Pedidos — Grupo 5',
    description:
      'Coleção do contrato v1.0. Pré-requisito: `npm run seed` (clientes 1-7, pedidos 101-108). Rode as pastas na ordem (Collection Runner). ' +
      'Variáveis: baseUrl, apiKey (admin), apiKeyG7 (somente /integracao).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5005/api/v1' },
    { key: 'apiKey', value: 'g5-pedidos-admin-2026' },
    { key: 'apiKeyG7', value: 'g7-entregas-leitura-2026' },
    { key: 'idPedido', value: '' },
    { key: 'idPedidoExclusao', value: '' },
    { key: 'idCliente', value: '' },
  ],
  item: [
    pasta('00 Saúde', [
      requisicao('GET /health (sem chave)', 'GET', '/health', {
        auth: 'nenhuma',
        testes: [STATUS(200), "pm.test('UP', () => pm.expect(pm.response.json().status).to.eql('UP'));"],
      }),
    ]),

    pasta(
      '01 Integração (consumida pelo G7)',
      [
        requisicao('GET /integracao/pedidos — chave do G7', 'GET', '/integracao/pedidos?tamanho=100', {
          auth: 'g7',
          testes: [
            STATUS(200),
            "pm.test('só CONFIRMADO/CANCELADO e sem itens', () => { const j = pm.response.json(); pm.expect(j.dados.length).to.be.above(0); j.dados.forEach(p => { pm.expect(['CONFIRMADO', 'CANCELADO']).to.include(p.status_pedido); pm.expect(p).to.not.have.property('itens'); }); });",
            "pm.test('campos do Contrato B', () => pm.expect(pm.response.json().dados[0]).to.have.all.keys('codigo_pedido', 'codigo_cliente', 'nome_cliente', 'endereco_entrega', 'cidade_entrega', 'uf_entrega', 'cep_entrega', 'data_pedido', 'quantidade_itens', 'valor_total', 'status_pedido', 'data_atualizacao'));",
          ],
        }),
        requisicao('GET /integracao/pedidos — paginação', 'GET', '/integracao/pedidos?pagina=1&tamanho=2', {
          auth: 'g7',
          testes: [STATUS(200), "pm.test('2 por página', () => { const j = pm.response.json(); pm.expect(j.dados).to.have.length(2); pm.expect(j.paginacao.tamanho).to.eql(2); });"],
        }),
        requisicao('403 — chave do G7 fora de /integracao', 'GET', '/pedidos', { auth: 'g7', testes: [STATUS(403), ERRO('SEM_PERMISSAO')] }),
        requisicao('400 — paginação inválida', 'GET', '/integracao/pedidos?tamanho=500', { auth: 'g7', testes: [STATUS(400), ERRO('REQUISICAO_INVALIDA')] }),
      ],
      'O G7 só enxerga esta estrutura (Contrato B): pedidos CONFIRMADO ou CANCELADO, sem itens.',
    ),

    pasta('02 Clientes', [
      requisicao('POST /clientes', 'POST', '/clientes', {
        corpo: { nome: 'Cliente Postman' },
        testes: [STATUS(201), "pm.collectionVariables.set('idCliente', String(pm.response.json().codigo_cliente));", "pm.test('ativo', () => pm.expect(pm.response.json().ativo).to.eql(true));"],
      }),
      requisicao('GET /clientes/{id}', 'GET', '/clientes/{{idCliente}}', { testes: [STATUS(200)] }),
      requisicao('PUT /clientes/{id}', 'PUT', '/clientes/{{idCliente}}', {
        corpo: { nome: 'Cliente Postman Renomeado', ativo: true },
        testes: [STATUS(200), "pm.test('renomeado', () => pm.expect(pm.response.json().nome).to.eql('Cliente Postman Renomeado'));"],
      }),
      requisicao('GET /clientes — lista', 'GET', '/clientes?tamanho=5', { testes: [STATUS(200)] }),
      requisicao('DELETE /clientes/{id} — desativa', 'DELETE', '/clientes/{{idCliente}}', { testes: [STATUS(204)] }),
      requisicao('GET /clientes/{id} — continua existindo, inativo', 'GET', '/clientes/{{idCliente}}', {
        testes: [STATUS(200), "pm.test('inativo', () => pm.expect(pm.response.json().ativo).to.eql(false));"],
      }),
      requisicao('DELETE /clientes/1 — 409 (tem pedidos)', 'DELETE', '/clientes/1', { testes: [STATUS(409), ERRO('OPERACAO_NAO_PERMITIDA')] }),
    ]),

    pasta(
      '03 Fluxo do pedido',
      [
        requisicao('POST /pedidos — criar (ABERTO)', 'POST', '/pedidos', {
          corpo: pedido(),
          testes: [
            STATUS(201),
            'const p = pm.response.json();',
            "pm.test('ABERTO, total e itens', () => { pm.expect(p.status_pedido).to.eql('ABERTO'); pm.expect(p.valor_total).to.eql(239.7); pm.expect(p.itens).to.have.length(2); pm.expect(p.quantidade_itens).to.eql(3); });",
            "pm.test('Location', () => pm.expect(pm.response.headers.get('Location')).to.eql('/api/v1/pedidos/' + p.codigo_pedido));",
            "pm.collectionVariables.set('idPedido', String(p.codigo_pedido));",
          ],
        }),
        requisicao('GET /integracao/pedidos — pedido ABERTO ainda não aparece', 'GET', '/integracao/pedidos?tamanho=100', {
          auth: 'g7',
          testes: [STATUS(200), "pm.test('ausente', () => pm.expect(pm.response.json().dados.map(p => String(p.codigo_pedido))).to.not.include(pm.collectionVariables.get('idPedido')));"],
        }),
        requisicao('PUT /pedidos/{id} — novo endereço e itens (ABERTO)', 'PUT', '/pedidos/{{idPedido}}', {
          corpo: { ...novoEndereco, itens: [{ descricao: 'Mochila', quantidade: 1, preco_unitario: 145 }] },
          testes: [STATUS(200), "pm.test('total recalculado', () => { const p = pm.response.json(); pm.expect(p.valor_total).to.eql(145); pm.expect(p.cidade_entrega).to.eql('Goiânia'); });"],
        }),
        requisicao('PATCH /pedidos/{id}/status — CONFIRMADO', 'PATCH', '/pedidos/{{idPedido}}/status', {
          corpo: { status_pedido: 'CONFIRMADO' },
          testes: [STATUS(200), "pm.test('confirmado', () => pm.expect(pm.response.json().status_pedido).to.eql('CONFIRMADO'));"],
        }),
        requisicao('GET /integracao/pedidos — pedido confirmado aparece', 'GET', '/integracao/pedidos?tamanho=100', {
          auth: 'g7',
          testes: [
            STATUS(200),
            "pm.test('presente como CONFIRMADO', () => { const p = pm.response.json().dados.find(x => String(x.codigo_pedido) === pm.collectionVariables.get('idPedido')); pm.expect(p).to.be.an('object'); pm.expect(p.status_pedido).to.eql('CONFIRMADO'); });",
          ],
        }),
        requisicao('PUT /pedidos/{id} — muda endereço de pedido CONFIRMADO', 'PUT', '/pedidos/{{idPedido}}', {
          corpo: { ...novoEndereco, cidade_entrega: 'Senador Canedo', cep_entrega: '75250000' },
          testes: [STATUS(200), "pm.test('endereço novo', () => pm.expect(pm.response.json().cidade_entrega).to.eql('Senador Canedo'));"],
        }),
        requisicao('GET /pedidos/{id} — consulta com itens', 'GET', '/pedidos/{{idPedido}}', {
          testes: [STATUS(200), "pm.test('itens', () => pm.expect(pm.response.json().itens).to.have.length(1));"],
        }),
        requisicao('PATCH /pedidos/{id}/status — CANCELADO', 'PATCH', '/pedidos/{{idPedido}}/status', {
          corpo: { status_pedido: 'CANCELADO' },
          testes: [STATUS(200), "pm.test('cancelado', () => pm.expect(pm.response.json().status_pedido).to.eql('CANCELADO'));"],
        }),
        requisicao('GET /integracao/pedidos — cancelado continua na view', 'GET', '/integracao/pedidos?tamanho=100', {
          auth: 'g7',
          testes: [
            STATUS(200),
            "pm.test('CANCELADO visível', () => { const p = pm.response.json().dados.find(x => String(x.codigo_pedido) === pm.collectionVariables.get('idPedido')); pm.expect(p.status_pedido).to.eql('CANCELADO'); });",
          ],
        }),
        requisicao('GET /pedidos — filtros', 'GET', '/pedidos?status_pedido=CANCELADO&tamanho=5', { testes: [STATUS(200)] }),
      ],
      'Execute na ordem: cada passo usa o código guardado pela criação.',
    ),

    pasta('04 Exclusão de pedido ABERTO', [
      requisicao('POST /pedidos — criar para excluir', 'POST', '/pedidos', {
        corpo: pedido({ codigo_cliente: 3 }),
        testes: [STATUS(201), "pm.collectionVariables.set('idPedidoExclusao', String(pm.response.json().codigo_pedido));"],
      }),
      requisicao('DELETE /pedidos/{id} — 204', 'DELETE', '/pedidos/{{idPedidoExclusao}}', { testes: [STATUS(204)] }),
      requisicao('GET /pedidos/{id} — 404 depois de excluir', 'GET', '/pedidos/{{idPedidoExclusao}}', { testes: [STATUS(404), ERRO('NAO_ENCONTRADO')] }),
    ]),

    pasta(
      '05 Cenários de erro',
      [
        requisicao('401 — sem X-API-Key', 'GET', '/pedidos', { auth: 'nenhuma', testes: [STATUS(401), ERRO('NAO_AUTENTICADO')] }),
        requisicao('400 — JSON malformado', 'POST', '/pedidos', {
          corpoBruto: '{"codigo_cliente": ',
          testes: [STATUS(400), ERRO('REQUISICAO_INVALIDA'), "pm.test('detalhes', () => pm.expect(pm.response.json().erro.detalhes).to.have.length.above(0));"],
        }),
        requisicao('400 — campo ausente e tipo errado', 'POST', '/pedidos', {
          corpo: { codigo_cliente: 2, endereco_entrega: 'Rua X', uf_entrega: 'GO', cep_entrega: '74120020', itens: [{ descricao: 'x', quantidade: '2', preco_unitario: 1 }] },
          testes: [STATUS(400), "pm.test('lista os campos', () => pm.expect(pm.response.json().erro.detalhes.map(d => d.campo)).to.include.members(['cidade_entrega', 'itens.0.quantidade']));"],
        }),
        requisicao('422 — UF inexistente e CEP inválido', 'POST', '/pedidos', {
          corpo: pedido({ uf_entrega: 'XX', cep_entrega: '1234' }),
          testes: [STATUS(422), ERRO('VALIDACAO_SEMANTICA'), "pm.test('detalha os dois campos', () => pm.expect(pm.response.json().erro.detalhes.map(d => d.campo)).to.include.members(['uf_entrega', 'cep_entrega']));"],
        }),
        requisicao('422 — pedido sem itens', 'POST', '/pedidos', { corpo: pedido({ itens: [] }), testes: [STATUS(422), ERRO('VALIDACAO_SEMANTICA')] }),
        requisicao('422 — cliente inexistente', 'POST', '/pedidos', { corpo: pedido({ codigo_cliente: 99999 }), testes: [STATUS(422), ERRO('VALIDACAO_SEMANTICA')] }),
        requisicao('409 — transição inválida (CANCELADO é final)', 'PATCH', '/pedidos/{{idPedido}}/status', {
          corpo: { status_pedido: 'CONFIRMADO' },
          testes: [STATUS(409), ERRO('TRANSICAO_INVALIDA')],
        }),
        requisicao('409 — PUT em pedido CANCELADO', 'PUT', '/pedidos/{{idPedido}}', { corpo: novoEndereco, testes: [STATUS(409), ERRO('OPERACAO_NAO_PERMITIDA')] }),
        requisicao('409 — DELETE em pedido que não está ABERTO', 'DELETE', '/pedidos/101', { testes: [STATUS(409), ERRO('OPERACAO_NAO_PERMITIDA')] }),
        requisicao('422 — status fora do enum', 'PATCH', '/pedidos/101/status', { corpo: { status_pedido: 'VOANDO' }, testes: [STATUS(422), ERRO('VALIDACAO_SEMANTICA')] }),
        requisicao('404 — pedido inexistente', 'GET', '/pedidos/99999999', { testes: [STATUS(404), ERRO('NAO_ENCONTRADO')] }),
        requisicao('400 — código inválido', 'GET', '/pedidos/abc', { testes: [STATUS(400), ERRO('REQUISICAO_INVALIDA')] }),
        requisicao('404 — rota inexistente', 'GET', '/inexistente', { testes: [STATUS(404), ERRO('NAO_ENCONTRADO')] }),
      ],
      'Cada requisição provoca um erro do contrato. Rode depois da pasta 03.',
    ),
  ],
};

const ambiente = {
  id: 'pedidos-g5-local',
  name: 'Pedidos G5 — local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:5005/api/v1', type: 'default', enabled: true },
    { key: 'apiKey', value: 'g5-pedidos-admin-2026', type: 'secret', enabled: true },
    { key: 'apiKeyG7', value: 'g7-entregas-leitura-2026', type: 'secret', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const escrever = (arquivo: string, conteudo: unknown) =>
  writeFileSync(path.join(raiz, arquivo), `${JSON.stringify(conteudo, null, 2)}\n`, 'utf8');

escrever('openapi.json', openapi);
escrever('postman/pedidos-g5.postman_collection.json', colecao);
escrever('postman/pedidos-g5-local.postman_environment.json', ambiente);
console.log('Gerados: docs/openapi.json e docs/postman/*');
