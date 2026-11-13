/*
 * Gera os artefatos de documentação a partir de um único ponto de verdade:
 *   docs/openapi.json                                  (importável no Swagger Editor, Postman, Insomnia)
 *   docs/postman/entregas-g7.postman_collection.json   (coleção com testes automáticos)
 *   docs/postman/entregas-g7-local.postman_environment.json
 * Uso: npm run docs:gerar
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openapi } from '../src/docs/openapi';

const raiz = path.resolve(__dirname, '..', 'docs');
mkdirSync(path.join(raiz, 'postman'), { recursive: true });

// ---------- helpers da coleção ----------

type Auth = 'escrita' | 'leitura' | 'nenhuma';

interface Opcoes {
  corpo?: unknown;
  corpoBruto?: string;
  auth?: Auth;
  descricao?: string;
  pre?: string[];
  testes?: string[];
}

const TESTE_STATUS = (codigo: number) => `pm.test('Status ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const TESTE_ERRO = (codigo: string) =>
  `pm.test('erro.codigo = ${codigo}', () => { const j = pm.response.json(); pm.expect(j.erro.codigo).to.eql('${codigo}'); pm.expect(j.request_id).to.be.a('string'); });`;

function requisicao(nome: string, metodo: string, caminho: string, op: Opcoes = {}) {
  const auth = op.auth ?? 'escrita';
  const header = [{ key: 'Accept', value: 'application/json' }, { key: 'X-Request-Id', value: '{{$guid}}' }];
  if (auth === 'escrita') header.push({ key: 'X-API-Key', value: '{{apiKey}}' });
  if (auth === 'leitura') header.push({ key: 'X-API-Key', value: '{{apiKeyLeitura}}' });
  const temCorpo = op.corpo !== undefined || op.corpoBruto !== undefined;
  if (temCorpo) header.push({ key: 'Content-Type', value: 'application/json' });

  const eventos = [];
  if (op.pre) eventos.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: op.pre } });
  if (op.testes) eventos.push({ listen: 'test', script: { type: 'text/javascript', exec: op.testes } });

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
    event: eventos,
  };
}

const pasta = (nome: string, item: unknown[], descricao?: string) => ({ name: nome, ...(descricao ? { description: descricao } : {}), item });

const endereco = {
  logradouro: 'Rua das Flores',
  numero: '120',
  complemento: 'Apto 32',
  bairro: 'Centro',
  cidade: 'Campinas',
  uf: 'SP',
  cep: '13010-100',
};

const corpoCriar = (idPedido: string) =>
  `{
  "id_pedido": ${idPedido},
  "id_cliente": 1034,
  "nome_destinatario": "Maria Souza",
  "transportadora": "Correios",
  "endereco_destino": ${JSON.stringify(endereco, null, 4).replace(/\n/g, '\n  ')},
  "data_prevista": "{{dataPrevista}}",
  "valor_frete": 25.90
}`;

// ---------- coleção ----------

const colecao = {
  info: {
    name: 'API de Entregas — Grupo 7',
    description:
      'Coleção do contrato de integração v1.0. Rode a pasta "01 Fluxo completo" na ordem (Collection Runner) e depois as demais. ' +
      'Variáveis: baseUrl, apiKey, apiKeyLeitura (ver o ambiente "Entregas G7 — local").',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Datas e ids gerados a cada execução para os testes não colidirem entre si',
          '// A API usa America/Sao_Paulo para definir "hoje"; calcular em UTC erraria o dia à noite',
          "const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); };",
          "pm.collectionVariables.set('dataPrevista', dia(7));",
          "pm.collectionVariables.set('hoje', dia(0));",
          "if (!pm.collectionVariables.get('idPedido')) pm.collectionVariables.set('idPedido', String(Math.floor(Math.random() * 900000) + 100000));",
          "if (!pm.collectionVariables.get('idPedidoExclusao')) pm.collectionVariables.set('idPedidoExclusao', String(Math.floor(Math.random() * 900000) + 1000000));",
        ],
      },
    },
  ],
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5007/api/v1' },
    { key: 'apiKey', value: 'g7-entregas-admin-2026' },
    { key: 'apiKeyLeitura', value: 'g2-vendas-leitura-2026' },
    { key: 'idEntrega', value: '' },
    { key: 'idEntregaExclusao', value: '' },
    { key: 'idPedido', value: '' },
    { key: 'idPedidoExclusao', value: '' },
  ],
  item: [
    pasta('00 Saúde', [
      requisicao('GET /health (sem chave)', 'GET', '/health', {
        auth: 'nenhuma',
        testes: [TESTE_STATUS(200), "pm.test('status UP', () => pm.expect(pm.response.json().status).to.eql('UP'));"],
      }),
    ]),

    pasta(
      '01 Fluxo completo',
      [
        requisicao('POST /entregas — cadastrar', 'POST', '/entregas', {
          corpoBruto: corpoCriar('{{idPedido}}'),
          testes: [
            TESTE_STATUS(201),
            'const e = pm.response.json();',
            "pm.test('código de rastreio e status inicial', () => { pm.expect(e.codigo_rastreio).to.match(/^ENT-\\d{4}-\\d{6}$/); pm.expect(e.status_entrega).to.eql('AGUARDANDO_COLETA'); });",
            "pm.test('Location aponta para o recurso', () => pm.expect(pm.response.headers.get('Location')).to.eql('/api/v1/entregas/' + e.id_entrega));",
            "pm.test('X-Request-Id devolvido', () => pm.expect(pm.response.headers.get('X-Request-Id')).to.be.a('string'));",
            "pm.collectionVariables.set('idEntrega', String(e.id_entrega));",
          ],
        }),
        requisicao('GET /entregas?id_pedido — listar', 'GET', '/entregas?id_pedido={{idPedido}}', {
          testes: [
            TESTE_STATUS(200),
            "pm.test('uma entrega e paginação', () => { const j = pm.response.json(); pm.expect(j.dados).to.have.length(1); pm.expect(j.paginacao.total_registros).to.eql(1); });",
          ],
        }),
        requisicao('GET /entregas/{id} — consultar', 'GET', '/entregas/{{idEntrega}}', {
          testes: [TESTE_STATUS(200), "pm.test('mesmo id', () => pm.expect(String(pm.response.json().id_entrega)).to.eql(pm.collectionVariables.get('idEntrega')));"],
        }),
        requisicao('PUT /entregas/{id} — atualizar cadastro', 'PUT', '/entregas/{{idEntrega}}', {
          corpoBruto: `{
  "nome_destinatario": "Maria Souza Lima",
  "transportadora": "Correios",
  "endereco_destino": ${JSON.stringify({ ...endereco, complemento: 'Apto 33' }, null, 4).replace(/\n/g, '\n  ')},
  "data_prevista": "{{dataPrevista}}",
  "valor_frete": 27.50
}`,
          testes: [TESTE_STATUS(200), "pm.test('dados atualizados', () => { const e = pm.response.json(); pm.expect(e.nome_destinatario).to.eql('Maria Souza Lima'); pm.expect(e.valor_frete).to.eql(27.5); });"],
        }),
        requisicao('PATCH /status — EM_TRANSITO', 'PATCH', '/entregas/{{idEntrega}}/status', {
          corpo: { status_entrega: 'EM_TRANSITO', observacao: 'Coletado na loja' },
          testes: [TESTE_STATUS(200), "pm.test('novo status', () => pm.expect(pm.response.json().status_entrega).to.eql('EM_TRANSITO'));"],
        }),
        requisicao('PATCH /status — SAIU_PARA_ENTREGA', 'PATCH', '/entregas/{{idEntrega}}/status', {
          corpo: { status_entrega: 'SAIU_PARA_ENTREGA' },
          testes: [TESTE_STATUS(200)],
        }),
        requisicao('PATCH /status — ENTREGUE', 'PATCH', '/entregas/{{idEntrega}}/status', {
          corpoBruto: '{\n  "status_entrega": "ENTREGUE",\n  "data_entrega": "{{hoje}}",\n  "observacao": "Recebido pela destinatária"\n}',
          testes: [TESTE_STATUS(200), "pm.test('entregue com data', () => { const e = pm.response.json(); pm.expect(e.status_entrega).to.eql('ENTREGUE'); pm.expect(e.data_entrega).to.eql(pm.collectionVariables.get('hoje')); });"],
        }),
        requisicao('GET /entregas/{id}/historico', 'GET', '/entregas/{{idEntrega}}/historico', {
          testes: [
            TESTE_STATUS(200),
            "pm.test('4 mudanças em ordem', () => pm.expect(pm.response.json().dados.map(h => h.status_entrega)).to.eql(['AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA', 'ENTREGUE']));",
          ],
        }),
        requisicao('GET /entregas — paginação', 'GET', '/entregas?pagina=1&tamanho=5', {
          testes: [TESTE_STATUS(200), "pm.test('respeita o tamanho', () => { const j = pm.response.json(); pm.expect(j.dados.length).to.be.at.most(5); pm.expect(j.paginacao.tamanho).to.eql(5); });"],
        }),
      ],
      'Execute na ordem: cada passo usa o id guardado pelo cadastro.',
    ),

    pasta('02 Exclusão', [
      requisicao('POST /entregas — cadastrar para excluir', 'POST', '/entregas', {
        corpoBruto: corpoCriar('{{idPedidoExclusao}}'),
        testes: [TESTE_STATUS(201), "pm.collectionVariables.set('idEntregaExclusao', String(pm.response.json().id_entrega));"],
      }),
      requisicao('DELETE /entregas/{id} — 204', 'DELETE', '/entregas/{{idEntregaExclusao}}', {
        testes: [TESTE_STATUS(204), "pm.test('sem corpo', () => pm.expect(pm.response.text()).to.eql(''));"],
      }),
      requisicao('GET /entregas/{id} — 404 após exclusão', 'GET', '/entregas/{{idEntregaExclusao}}', {
        testes: [TESTE_STATUS(404), TESTE_ERRO('NAO_ENCONTRADO')],
      }),
    ]),

    pasta(
      '03 Cenários de erro',
      [
        requisicao('401 — sem X-API-Key', 'GET', '/entregas', { auth: 'nenhuma', testes: [TESTE_STATUS(401), TESTE_ERRO('NAO_AUTENTICADO')] }),
        requisicao('403 — chave somente leitura (G2) em POST', 'POST', '/entregas', {
          auth: 'leitura',
          corpoBruto: corpoCriar('1'),
          testes: [TESTE_STATUS(403), TESTE_ERRO('SEM_PERMISSAO')],
        }),
        requisicao('400 — JSON malformado', 'POST', '/entregas', {
          corpoBruto: '{"id_pedido": ',
          testes: [TESTE_STATUS(400), TESTE_ERRO('REQUISICAO_INVALIDA'), "pm.test('detalhes presentes', () => pm.expect(pm.response.json().erro.detalhes).to.have.length.above(0));"],
        }),
        requisicao('400 — campo obrigatório ausente e tipo errado', 'POST', '/entregas', {
          corpo: { id_pedido: 1, nome_destinatario: 'Maria Souza', transportadora: 'Correios', endereco_destino: endereco, data_prevista: '2030-01-01', valor_frete: 'caro' },
          testes: [TESTE_STATUS(400), TESTE_ERRO('REQUISICAO_INVALIDA'), "pm.test('lista cada campo', () => pm.expect(pm.response.json().erro.detalhes.map(d => d.campo)).to.include.members(['id_cliente', 'valor_frete']));"],
        }),
        requisicao('400 — id inválido', 'GET', '/entregas/abc', { testes: [TESTE_STATUS(400), TESTE_ERRO('REQUISICAO_INVALIDA')] }),
        requisicao('422 — data no passado e UF inexistente', 'POST', '/entregas', {
          corpo: {
            id_pedido: 999991,
            id_cliente: 1,
            nome_destinatario: 'Maria Souza',
            transportadora: 'Correios',
            endereco_destino: { ...endereco, uf: 'XX' },
            data_prevista: '2020-01-01',
            valor_frete: 10,
          },
          testes: [TESTE_STATUS(422), TESTE_ERRO('VALIDACAO_SEMANTICA'), "pm.test('detalha os dois campos', () => pm.expect(pm.response.json().erro.detalhes.map(d => d.campo)).to.include.members(['data_prevista', 'endereco_destino.uf']));"],
        }),
        requisicao('409 — entrega ativa duplicada para o pedido', 'POST', '/entregas', {
          corpoBruto: corpoCriar('{{idPedido}}'),
          testes: [TESTE_STATUS(409), TESTE_ERRO('ENTREGA_DUPLICADA')],
          descricao: 'Depende da pasta 01 (a entrega do idPedido continua ativa, ENTREGUE).',
        }),
        requisicao('409 — transição de status inválida', 'PATCH', '/entregas/{{idEntrega}}/status', {
          corpo: { status_entrega: 'EM_TRANSITO' },
          testes: [TESTE_STATUS(409), TESTE_ERRO('TRANSICAO_INVALIDA')],
          descricao: 'ENTREGUE é status final.',
        }),
        requisicao('409 — PUT em entrega que não permite edição', 'PUT', '/entregas/{{idEntrega}}', {
          corpoBruto: `{
  "nome_destinatario": "Maria Souza",
  "transportadora": "Correios",
  "endereco_destino": ${JSON.stringify(endereco, null, 4).replace(/\n/g, '\n  ')},
  "data_prevista": "{{dataPrevista}}",
  "valor_frete": 25.90
}`,
          testes: [TESTE_STATUS(409), TESTE_ERRO('OPERACAO_NAO_PERMITIDA')],
        }),
        requisicao('409 — DELETE em entrega já coletada', 'DELETE', '/entregas/{{idEntrega}}', {
          testes: [TESTE_STATUS(409), TESTE_ERRO('OPERACAO_NAO_PERMITIDA')],
        }),
        requisicao('404 — entrega inexistente', 'GET', '/entregas/99999999', { testes: [TESTE_STATUS(404), TESTE_ERRO('NAO_ENCONTRADO')] }),
        requisicao('404 — rota inexistente', 'GET', '/inexistente', { testes: [TESTE_STATUS(404), TESTE_ERRO('NAO_ENCONTRADO')] }),
      ],
      'Cada requisição provoca um erro do contrato. Rode depois da pasta 01.',
    ),

    pasta(
      '04 Integração G5 (interno)',
      [
        requisicao('POST /integracoes/pedidos/importar', 'POST', '/integracoes/pedidos/importar', {
          descricao:
            'Requer a API do G5 no ar (G5_BASE_URL). Cria as entregas dos pedidos CONFIRMADOS e atualiza/cancela as já importadas; campos que o G5 não envia ficam em `pendencias`. Com o G5 fora do ar responde 503 INTEGRACAO_INDISPONIVEL (após 3 repetições, cerca de 7 s).',
          testes: [
            "pm.test('200 (resumo) ou erro de integração documentado', () => pm.expect([200, 502, 503]).to.include(pm.response.code));",
            "if (pm.response.code === 200) pm.test('resumo completo', () => { const r = pm.response.json(); ['importacao_id', 'consultados', 'inseridos', 'atualizados', 'sem_alteracao', 'ignorados', 'rejeitados'].forEach(k => pm.expect(r).to.have.property(k)); });",
          ],
        }),
        requisicao('GET /integracoes/pedidos — pedidos importados', 'GET', '/integracoes/pedidos', { auth: 'leitura', testes: [TESTE_STATUS(200)] }),
        requisicao('GET /integracoes/logs — ocorrências', 'GET', '/integracoes/logs?limite=20', { auth: 'leitura', testes: [TESTE_STATUS(200)] }),
        requisicao('POST /integracoes/pedidos/importar — 403 com chave de leitura', 'POST', '/integracoes/pedidos/importar', {
          auth: 'leitura',
          testes: [TESTE_STATUS(403), TESTE_ERRO('SEM_PERMISSAO')],
        }),
      ],
      'Consumo da API de Pedidos do Grupo 5. Para completar as pendências de uma entrega importada, use PUT /entregas/{id}.',
    ),
  ],
};

const ambiente = {
  id: 'entregas-g7-local',
  name: 'Entregas G7 — local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:5007/api/v1', type: 'default', enabled: true },
    { key: 'apiKey', value: 'g7-entregas-admin-2026', type: 'secret', enabled: true },
    { key: 'apiKeyLeitura', value: 'g2-vendas-leitura-2026', type: 'secret', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const escrever = (arquivo: string, conteudo: unknown) =>
  writeFileSync(path.join(raiz, arquivo), `${JSON.stringify(conteudo, null, 2)}\n`, 'utf8');

escrever('openapi.json', openapi);
escrever('postman/entregas-g7.postman_collection.json', colecao);
escrever('postman/entregas-g7-local.postman_environment.json', ambiente);
console.log('Gerados: docs/openapi.json e docs/postman/*');
