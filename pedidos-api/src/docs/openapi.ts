/*
 * Especificação OpenAPI da API de Pedidos (Grupo 5), derivada do contrato v1.0.
 * Servida em GET /openapi.json e GET /docs; exportada para docs/openapi.json por `npm run docs:gerar`.
 * Não importa nada da aplicação para poder ser usada por scripts sem banco nem .env.
 */

const ref = (nome: string) => ({ $ref: `#/components/schemas/${nome}` });
const resp = (nome: string) => ({ $ref: `#/components/responses/${nome}` });
const json = (schema: object, example?: unknown) => ({
  content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});

const exemploResumo = {
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
};

const exemploCriar = {
  codigo_cliente: 1,
  endereco_entrega: 'Rua 10, 250, Setor Oeste',
  cidade_entrega: 'Goiânia',
  uf_entrega: 'GO',
  cep_entrega: '74120020',
  itens: [{ descricao: 'Camiseta básica', quantidade: 3, preco_unitario: 59.9 }],
};

const erro = (descricao: string, status: number, codigo: string, detalhes: unknown[] = []) => ({
  description: descricao,
  ...json(ref('Erro'), {
    erro: { status, codigo, mensagem: descricao, detalhes },
    caminho: '/api/v1/pedidos',
    data_hora: '2026-11-13T10:45:10-03:00',
    request_id: '3f6c1e2a-8b7d-4c11-9a52-0e4b7d9f1a23',
  }),
});

const codigoPedido = { name: 'codigo_pedido', in: 'path', required: true, schema: { type: 'integer', minimum: 1 }, example: 101 };
const codigoCliente = { name: 'codigo_cliente', in: 'path', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 };
const requestId = { $ref: '#/components/parameters/XRequestId' };
const pagina = { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } };
const tamanho = { name: 'tamanho', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } };
const secured = [{ ApiKeyAuth: [] }];

const erros = (...codigos: string[]) =>
  Object.fromEntries(
    codigos.map((c) => [
      c,
      resp(
        {
          '400': 'RequisicaoInvalida', '401': 'NaoAutenticado', '403': 'SemPermissao', '404': 'NaoEncontrado',
          '409': 'Conflito', '422': 'ValidacaoSemantica', '500': 'ErroInterno', '503': 'ServicoIndisponivel',
        }[c]!,
      ),
    ]),
  );

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'API de Pedidos — Grupo 5',
    version: '1.0.0',
    description: [
      'API do Sistema de Pedidos (Grupo 5), construída reaproveitando a estrutura do **Contrato B** (integração por banco de dados): tabelas `cliente`, `pedido`, `item_pedido` e a view `integracao.vw_integracao_pedidos`.',
      '',
      'O Grupo 7 (Entregas) é o consumidor, **somente via `GET /integracao/pedidos`**.',
      '',
      '**Autenticação:** cabeçalho `X-API-Key`. A chave de administração (uso interno do G5) acessa tudo. A chave do G7 só faz `GET` em `/integracao/*` (403 nas demais rotas). `/health` não exige chave.',
      '',
      '**Regras do Contrato B:** pedidos `ABERTO` não aparecem na integração; pedido nunca some da integração (cancelar muda o status para `CANCELADO`); `data_atualizacao` muda a cada alteração do pedido; CEP com 8 dígitos sem traço; UF válida em maiúsculas.',
      '',
      '**Erros:** formato padrão (`erro`, `caminho`, `data_hora`, `request_id`). Ordem: 401, 403, 400, 404, 409, 422. 400 = estrutura (JSON, campo ausente, tipo errado, parâmetro); 422 = valor com tipo correto que viola formato, faixa ou regra.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:5005/api/v1', description: 'Ambiente local' }],
  tags: [
    { name: 'Integração (G7)', description: 'Estrutura de integração consumida pelo Grupo 7' },
    { name: 'Pedidos', description: 'Uso interno do Grupo 5' },
    { name: 'Clientes', description: 'Uso interno do Grupo 5' },
    { name: 'Saúde' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Saúde'],
        summary: 'Verificar disponibilidade da API',
        responses: {
          '200': { description: 'API disponível', ...json({ type: 'object', properties: { status: { type: 'string', example: 'UP' } } }) },
          '503': resp('ServicoIndisponivel'),
        },
      },
    },
    '/integracao/pedidos': {
      get: {
        tags: ['Integração (G7)'],
        summary: 'Listar pedidos da estrutura de integração',
        description:
          'Equivale à view `integracao.vw_integracao_pedidos`: um pedido por linha, somente `CONFIRMADO` e `CANCELADO`, sem itens. Ordenado por `codigo_pedido`. O consumidor compara `data_atualizacao` com a última leitura para detectar alterações.',
        security: secured,
        parameters: [requestId, pagina, tamanho],
        responses: {
          '200': { description: 'Página de pedidos', ...json(ref('ListaPedidos')) },
          ...erros('400', '401', '403', '500', '503'),
        },
      },
    },
    '/clientes': {
      get: {
        tags: ['Clientes'],
        summary: 'Listar clientes',
        security: secured,
        parameters: [requestId, { name: 'ativo', in: 'query', schema: { type: 'boolean' } }, pagina, tamanho],
        responses: { '200': { description: 'Página de clientes', ...json(ref('ListaClientes')) }, ...erros('400', '401', '403', '500', '503') },
      },
      post: {
        tags: ['Clientes'],
        summary: 'Cadastrar cliente',
        security: secured,
        parameters: [requestId],
        requestBody: { required: true, ...json(ref('ClienteCriar'), { nome: 'Novo Cliente' }) },
        responses: {
          '201': { description: 'Cliente criado', headers: { Location: { schema: { type: 'string' } } }, ...json(ref('Cliente')) },
          ...erros('400', '401', '403', '422', '500', '503'),
        },
      },
    },
    '/clientes/{codigo_cliente}': {
      get: {
        tags: ['Clientes'],
        summary: 'Consultar cliente',
        security: secured,
        parameters: [codigoCliente, requestId],
        responses: { '200': { description: 'Cliente', ...json(ref('Cliente')) }, ...erros('400', '401', '403', '404', '500', '503') },
      },
      put: {
        tags: ['Clientes'],
        summary: 'Atualizar cliente',
        description: 'Desativar (`ativo: false`) é recusado com 409 se o cliente tiver pedido ABERTO ou CONFIRMADO.',
        security: secured,
        parameters: [codigoCliente, requestId],
        requestBody: { required: true, ...json(ref('ClienteAtualizar')) },
        responses: { '200': { description: 'Cliente atualizado', ...json(ref('Cliente')) }, ...erros('400', '401', '403', '404', '409', '422', '500', '503') },
      },
      delete: {
        tags: ['Clientes'],
        summary: 'Desativar cliente',
        description: 'O produtor não apaga fisicamente: DELETE desativa (`ativo = false`). 409 se houver pedido ABERTO ou CONFIRMADO.',
        security: secured,
        parameters: [codigoCliente, requestId],
        responses: { '204': { description: 'Cliente desativado' }, ...erros('400', '401', '403', '404', '409', '500', '503') },
      },
    },
    '/pedidos': {
      get: {
        tags: ['Pedidos'],
        summary: 'Listar pedidos (todos os status)',
        security: secured,
        parameters: [
          requestId,
          { name: 'status_pedido', in: 'query', schema: ref('StatusPedido') },
          { name: 'codigo_cliente', in: 'query', schema: { type: 'integer', minimum: 1 } },
          pagina,
          tamanho,
        ],
        responses: { '200': { description: 'Página de pedidos (sem itens)', ...json(ref('ListaPedidos')) }, ...erros('400', '401', '403', '500', '503') },
      },
      post: {
        tags: ['Pedidos'],
        summary: 'Criar pedido (nasce ABERTO)',
        description: '`valor_total` é calculado a partir dos itens; `data_pedido` é a data do servidor. Cliente deve existir e estar ativo.',
        security: secured,
        parameters: [requestId],
        requestBody: { required: true, ...json(ref('PedidoCriar'), exemploCriar) },
        responses: {
          '201': { description: 'Pedido criado', headers: { Location: { schema: { type: 'string' } } }, ...json(ref('Pedido')) },
          ...erros('400', '401', '403', '422', '500', '503'),
        },
      },
    },
    '/pedidos/{codigo_pedido}': {
      get: {
        tags: ['Pedidos'],
        summary: 'Consultar pedido com itens',
        security: secured,
        parameters: [codigoPedido, requestId],
        responses: { '200': { description: 'Pedido', ...json(ref('Pedido')) }, ...erros('400', '401', '403', '404', '500', '503') },
      },
      put: {
        tags: ['Pedidos'],
        summary: 'Atualizar endereço (e itens, se ABERTO)',
        description:
          'ABERTO e CONFIRMADO aceitam novo endereço (a `data_atualizacao` muda, o G7 detecta). `itens` só com o pedido ABERTO e, se enviados, substituem todos e recalculam o total. CANCELADO retorna 409. `codigo_cliente` é imutável.',
        security: secured,
        parameters: [codigoPedido, requestId],
        requestBody: { required: true, ...json(ref('PedidoAtualizar')) },
        responses: { '200': { description: 'Pedido atualizado', ...json(ref('Pedido')) }, ...erros('400', '401', '403', '404', '409', '422', '500', '503') },
      },
      delete: {
        tags: ['Pedidos'],
        summary: 'Excluir pedido ABERTO',
        description: 'Pedido CONFIRMADO ou CANCELADO nunca é apagado (use PATCH com CANCELADO).',
        security: secured,
        parameters: [codigoPedido, requestId],
        responses: { '204': { description: 'Pedido excluído' }, ...erros('400', '401', '403', '404', '409', '500', '503') },
      },
    },
    '/pedidos/{codigo_pedido}/status': {
      patch: {
        tags: ['Pedidos'],
        summary: 'Confirmar ou cancelar pedido',
        description: 'ABERTO → CONFIRMADO ou CANCELADO; CONFIRMADO → CANCELADO; CANCELADO é final. Outra transição retorna 409; valor fora do enum, 422.',
        security: secured,
        parameters: [codigoPedido, requestId],
        requestBody: { required: true, ...json(ref('AlterarStatus'), { status_pedido: 'CONFIRMADO' }) },
        responses: { '200': { description: 'Pedido com o novo status', ...json(ref('Pedido')) }, ...erros('400', '401', '403', '404', '409', '422', '500', '503') },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'Chave de administração (G5) ou chave do G7 (somente GET em /integracao/*).' },
    },
    parameters: {
      XRequestId: {
        name: 'X-Request-Id',
        in: 'header',
        description: 'UUID do consumidor; devolvido na resposta e no corpo de erro. A API gera um se ausente.',
        schema: { type: 'string', format: 'uuid' },
      },
    },
    responses: {
      RequisicaoInvalida: erro('JSON malformado, campo obrigatório ausente, tipo errado, Content-Type inválido ou parâmetro inválido', 400, 'REQUISICAO_INVALIDA', [{ campo: 'cidade_entrega', problema: 'campo obrigatório' }]),
      NaoAutenticado: erro('X-API-Key ausente ou inválida', 401, 'NAO_AUTENTICADO'),
      SemPermissao: erro('Chave sem permissão para a rota ou operação', 403, 'SEM_PERMISSAO'),
      NaoEncontrado: erro('Registro ou rota inexistente', 404, 'NAO_ENCONTRADO'),
      Conflito: erro('TRANSICAO_INVALIDA ou OPERACAO_NAO_PERMITIDA', 409, 'TRANSICAO_INVALIDA'),
      ValidacaoSemantica: erro('Valor com tipo correto que viola formato, faixa ou regra de negócio', 422, 'VALIDACAO_SEMANTICA', [{ campo: 'uf_entrega', problema: "UF 'XX' inexistente" }]),
      ErroInterno: erro('Erro inesperado no servidor', 500, 'ERRO_INTERNO'),
      ServicoIndisponivel: {
        ...erro('API ou banco de dados temporariamente indisponível', 503, 'SERVICO_INDISPONIVEL'),
        headers: { 'Retry-After': { schema: { type: 'integer', example: 5 } } },
      },
    },
    schemas: {
      StatusPedido: { type: 'string', enum: ['ABERTO', 'CONFIRMADO', 'CANCELADO'] },
      PedidoResumo: {
        type: 'object',
        description: 'Campos do Contrato B (vw_integracao_pedidos).',
        properties: {
          codigo_pedido: { type: 'integer' },
          codigo_cliente: { type: 'integer' },
          nome_cliente: { type: 'string', maxLength: 100 },
          endereco_entrega: { type: 'string', maxLength: 200, description: 'Rua, número e bairro' },
          cidade_entrega: { type: 'string', maxLength: 80 },
          uf_entrega: { type: 'string', minLength: 2, maxLength: 2 },
          cep_entrega: { type: 'string', pattern: '^\\d{8}$' },
          data_pedido: { type: 'string', format: 'date-time', description: 'Não pode ser futura' },
          quantidade_itens: { type: 'integer', minimum: 1 },
          valor_total: { type: 'number', minimum: 0.01 },
          status_pedido: ref('StatusPedido'),
          data_atualizacao: { type: 'string', format: 'date-time', description: 'Muda a cada alteração do pedido' },
        },
        example: exemploResumo,
      },
      ItemPedido: {
        type: 'object',
        properties: {
          id_item: { type: 'integer' },
          descricao: { type: 'string' },
          quantidade: { type: 'integer' },
          preco_unitario: { type: 'number' },
        },
      },
      ItemEntrada: {
        type: 'object',
        required: ['descricao', 'quantidade', 'preco_unitario'],
        properties: {
          descricao: { type: 'string', minLength: 1, maxLength: 100 },
          quantidade: { type: 'integer', minimum: 1 },
          preco_unitario: { type: 'number', exclusiveMinimum: true, minimum: 0, description: 'Até 2 casas decimais' },
        },
      },
      Pedido: {
        allOf: [ref('PedidoResumo'), { type: 'object', properties: { itens: { type: 'array', items: ref('ItemPedido') } } }],
      },
      PedidoCriar: {
        type: 'object',
        required: ['codigo_cliente', 'endereco_entrega', 'cidade_entrega', 'uf_entrega', 'cep_entrega', 'itens'],
        properties: {
          codigo_cliente: { type: 'integer', minimum: 1 },
          endereco_entrega: { type: 'string', minLength: 1, maxLength: 200 },
          cidade_entrega: { type: 'string', minLength: 1, maxLength: 80 },
          uf_entrega: { type: 'string', pattern: '^[A-Z]{2}$' },
          cep_entrega: { type: 'string', pattern: '^\\d{8}$' },
          itens: { type: 'array', minItems: 1, items: ref('ItemEntrada') },
        },
      },
      PedidoAtualizar: {
        type: 'object',
        required: ['endereco_entrega', 'cidade_entrega', 'uf_entrega', 'cep_entrega'],
        properties: {
          codigo_cliente: { type: 'integer', description: 'Opcional; se enviado, deve ser igual ao gravado' },
          endereco_entrega: { type: 'string', minLength: 1, maxLength: 200 },
          cidade_entrega: { type: 'string', minLength: 1, maxLength: 80 },
          uf_entrega: { type: 'string', pattern: '^[A-Z]{2}$' },
          cep_entrega: { type: 'string', pattern: '^\\d{8}$' },
          itens: { type: 'array', minItems: 1, items: ref('ItemEntrada'), description: 'Só com pedido ABERTO; substitui todos os itens' },
        },
      },
      AlterarStatus: { type: 'object', required: ['status_pedido'], properties: { status_pedido: ref('StatusPedido') } },
      ListaPedidos: {
        type: 'object',
        properties: {
          dados: { type: 'array', items: ref('PedidoResumo') },
          paginacao: {
            type: 'object',
            properties: { pagina: { type: 'integer' }, tamanho: { type: 'integer' }, total_registros: { type: 'integer' }, total_paginas: { type: 'integer' } },
          },
        },
      },
      Cliente: {
        type: 'object',
        properties: { codigo_cliente: { type: 'integer' }, nome: { type: 'string', maxLength: 100 }, ativo: { type: 'boolean' } },
      },
      ClienteCriar: { type: 'object', required: ['nome'], properties: { nome: { type: 'string', minLength: 1, maxLength: 100 } } },
      ClienteAtualizar: {
        type: 'object',
        required: ['nome', 'ativo'],
        properties: { nome: { type: 'string', minLength: 1, maxLength: 100 }, ativo: { type: 'boolean' } },
      },
      ListaClientes: {
        type: 'object',
        properties: {
          dados: { type: 'array', items: ref('Cliente') },
          paginacao: {
            type: 'object',
            properties: { pagina: { type: 'integer' }, tamanho: { type: 'integer' }, total_registros: { type: 'integer' }, total_paginas: { type: 'integer' } },
          },
        },
      },
      Erro: {
        type: 'object',
        properties: {
          erro: {
            type: 'object',
            properties: {
              status: { type: 'integer' },
              codigo: {
                type: 'string',
                enum: ['REQUISICAO_INVALIDA', 'NAO_AUTENTICADO', 'SEM_PERMISSAO', 'NAO_ENCONTRADO', 'TRANSICAO_INVALIDA', 'OPERACAO_NAO_PERMITIDA', 'VALIDACAO_SEMANTICA', 'ERRO_INTERNO', 'SERVICO_INDISPONIVEL'],
              },
              mensagem: { type: 'string' },
              detalhes: {
                type: 'array',
                description: 'Obrigatório (não vazio) em 400 e 422',
                items: { type: 'object', properties: { campo: { type: 'string' }, problema: { type: 'string' } } },
              },
            },
          },
          caminho: { type: 'string' },
          data_hora: { type: 'string', format: 'date-time' },
          request_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
};
