/*
 * Especificação OpenAPI da API de Entregas (Grupo 7), derivada do contrato v1.0.
 * Servida em GET /openapi.json e GET /docs; exportada para docs/openapi.json por `npm run docs:gerar`.
 * Este arquivo não importa nada da aplicação para poder ser usado por scripts sem banco nem .env.
 */

const STATUS = ['AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'NAO_ENTREGUE', 'DEVOLVIDA', 'CANCELADA'];

const ref = (nome: string) => ({ $ref: `#/components/schemas/${nome}` });
const resp = (nome: string) => ({ $ref: `#/components/responses/${nome}` });
const json = (schema: object, example?: unknown) => ({
  content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});

const exemploEntrega = {
  id_entrega: 701,
  codigo_rastreio: 'ENT-2026-000701',
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
  data_prevista: '2026-11-20',
  valor_frete: 25.9,
  status_entrega: 'AGUARDANDO_COLETA',
  data_entrega: null,
  origem: 'API',
  pendencias: [],
  data_criacao: '2026-11-11T20:40:00-03:00',
  data_atualizacao: '2026-11-11T20:40:00-03:00',
};

const exemploCriar = {
  id_pedido: 5012,
  id_cliente: 1034,
  nome_destinatario: 'Maria Souza',
  transportadora: 'Correios',
  endereco_destino: exemploEntrega.endereco_destino,
  data_prevista: '2026-11-20',
  valor_frete: 25.9,
};

const respostaErro = (descricao: string, status: number, codigo: string, detalhes: unknown[] = []) => ({
  description: descricao,
  ...json(ref('Erro'), {
    erro: { status, codigo, mensagem: descricao, detalhes },
    caminho: '/api/v1/entregas',
    data_hora: '2026-11-11T20:45:10-03:00',
    request_id: '3f6c1e2a-8b7d-4c11-9a52-0e4b7d9f1a23',
  }),
});

const idEntrega = { $ref: '#/components/parameters/IdEntrega' };
const requestId = { $ref: '#/components/parameters/XRequestId' };

const secured = [{ ApiKeyAuth: [] }];

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'API de Entregas — Grupo 7',
    version: '1.0.0',
    description: [
      'Implementação do **Contrato de Integração REST — API de Entregas (Grupo 7)**, versão 1.0.',
      '',
      'O Grupo 7 (Entregas) é fornecedor desta API para o Grupo 2 (Vendas) e consome a API de Pedidos do Grupo 5.',
      '',
      '**Autenticação:** cabeçalho `X-API-Key`. A chave de leitura/escrita acessa tudo; a chave somente leitura recebe `403` em POST, PUT, PATCH e DELETE. `/health` não exige chave.',
      '',
      '**Erros:** todo 4xx/5xx segue o formato padrão (`erro`, `caminho`, `data_hora`, `request_id`). Ordem de verificação: 401, 403, 400, 404, 409, 422.',
      '',
      '**Entregas importadas de pedidos do G5** (`origem = PEDIDOS_G5`, `id_pedido` = `codigo_pedido`) nascem com campos nulos listados em `pendencias`; complete-os com `PUT /entregas/{id}`. O G2 localiza a entrega de uma venda por `GET /entregas?id_pedido={numero da venda}`.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:5007/api/v1', description: 'Ambiente local' }],
  tags: [
    { name: 'Entregas', description: 'Contrato com o Grupo 2 (Vendas): consulta de entregas e histórico' },
    { name: 'Saúde', description: 'Disponibilidade da API' },
    { name: 'Integração G5 (interno)', description: 'Consumo da API de Pedidos do Grupo 5; uso do próprio Grupo 7' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Saúde'],
        summary: 'Verificar disponibilidade da API',
        description: 'Não exige X-API-Key. Consulta o banco; se estiver fora, retorna 503.',
        responses: {
          '200': { description: 'API disponível', ...json({ type: 'object', properties: { status: { type: 'string', example: 'UP' } } }) },
          '503': resp('ServicoIndisponivel'),
        },
      },
    },
    '/entregas': {
      get: {
        tags: ['Entregas'],
        summary: 'Listar entregas',
        security: secured,
        parameters: [
          requestId,
          { name: 'id_pedido', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'status_entrega', in: 'query', schema: ref('StatusEntrega') },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'tamanho', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          '200': { description: 'Lista paginada (vazia retorna 200 com `dados: []`)', ...json(ref('ListaEntregas')) },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
      post: {
        tags: ['Entregas'],
        summary: 'Cadastrar a entrega de um pedido',
        description:
          'Só pode existir uma entrega ativa (status diferente de CANCELADA) por `id_pedido`. Status inicial `AGUARDANDO_COLETA`; `codigo_rastreio` gerado pela API.',
        security: secured,
        parameters: [requestId],
        requestBody: { required: true, ...json(ref('EntregaCriar'), exemploCriar) },
        responses: {
          '201': {
            description: 'Entrega criada',
            headers: { Location: { schema: { type: 'string', example: '/api/v1/entregas/701' } } },
            ...json(ref('Entrega'), exemploEntrega),
          },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '403': resp('SemPermissao'),
          '409': resp('Conflito'),
          '422': resp('ValidacaoSemantica'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
    },
    '/entregas/{id_entrega}': {
      get: {
        tags: ['Entregas'],
        summary: 'Consultar uma entrega',
        security: secured,
        parameters: [idEntrega, requestId],
        responses: {
          '200': { description: 'Entrega', ...json(ref('Entrega'), exemploEntrega) },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '404': resp('NaoEncontrado'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
      put: {
        tags: ['Entregas'],
        summary: 'Atualizar dados cadastrais da entrega',
        description: [
          'Substituição completa dos campos editáveis. Permitido apenas com status `AGUARDANDO_COLETA` ou `EM_TRANSITO` (senão 409).',
          '',
          '- `id_pedido`: imutável. `id_cliente`: imutável, exceto para preencher a pendência de entregas importadas do G5.',
          '- `status_entrega` e `data_entrega` só mudam por `PATCH /status`: valor diferente do gravado retorna 422.',
          '- `data_prevista` só é revalidada (não pode ser no passado) se mudou.',
          '- Campos somente leitura e desconhecidos são ignorados.',
        ].join('\n'),
        security: secured,
        parameters: [idEntrega, requestId],
        requestBody: { required: true, ...json(ref('EntregaAtualizar')) },
        responses: {
          '200': { description: 'Entrega atualizada', ...json(ref('Entrega'), exemploEntrega) },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '403': resp('SemPermissao'),
          '404': resp('NaoEncontrado'),
          '409': resp('Conflito'),
          '422': resp('ValidacaoSemantica'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
      delete: {
        tags: ['Entregas'],
        summary: 'Excluir uma entrega ainda não coletada',
        description: 'Só com status `AGUARDANDO_COLETA`; nos demais casos use `PATCH` com `CANCELADA`.',
        security: secured,
        parameters: [idEntrega, requestId],
        responses: {
          '204': { description: 'Entrega excluída (sem corpo)' },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '403': resp('SemPermissao'),
          '404': resp('NaoEncontrado'),
          '409': resp('Conflito'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
    },
    '/entregas/{id_entrega}/status': {
      patch: {
        tags: ['Entregas'],
        summary: 'Alterar o status da entrega',
        description: [
          'Aceita apenas as transições do contrato; qualquer outra (inclusive para o mesmo status) retorna 409.',
          '',
          '| De | Para |',
          '|---|---|',
          '| AGUARDANDO_COLETA | EM_TRANSITO, CANCELADA |',
          '| EM_TRANSITO | SAIU_PARA_ENTREGA, CANCELADA |',
          '| SAIU_PARA_ENTREGA | ENTREGUE, NAO_ENTREGUE |',
          '| NAO_ENTREGUE | SAIU_PARA_ENTREGA, DEVOLVIDA |',
          '| ENTREGUE, DEVOLVIDA, CANCELADA | (final) |',
          '',
          '`data_entrega` é obrigatória e não pode ser futura quando o status é `ENTREGUE`, e proibida nos demais.',
        ].join('\n'),
        security: secured,
        parameters: [idEntrega, requestId],
        requestBody: {
          required: true,
          ...json(ref('AlterarStatus'), {
            status_entrega: 'ENTREGUE',
            data_entrega: '2026-11-18',
            observacao: 'Recebido pela destinatária',
          }),
        },
        responses: {
          '200': { description: 'Entrega com o novo status', ...json(ref('Entrega'), exemploEntrega) },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '403': resp('SemPermissao'),
          '404': resp('NaoEncontrado'),
          '409': resp('Conflito'),
          '422': resp('ValidacaoSemantica'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
    },
    '/entregas/{id_entrega}/historico': {
      get: {
        tags: ['Entregas'],
        summary: 'Consultar o histórico de status',
        description: 'Da mudança mais antiga para a mais recente.',
        security: secured,
        parameters: [idEntrega, requestId],
        responses: {
          '200': {
            description: 'Histórico',
            ...json(ref('ListaHistorico'), {
              dados: [
                { status_entrega: 'AGUARDANDO_COLETA', data_hora: '2026-11-11T20:40:00-03:00', observacao: null },
                { status_entrega: 'EM_TRANSITO', data_hora: '2026-11-12T09:15:00-03:00', observacao: 'Coletado na loja' },
              ],
            }),
          },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
          '404': resp('NaoEncontrado'),
          '500': resp('ErroInterno'),
          '503': resp('ServicoIndisponivel'),
        },
      },
    },
    '/integracoes/pedidos/importar': {
      post: {
        tags: ['Integração G5 (interno)'],
        summary: 'Importar pedidos do G5 e criar/atualizar/cancelar entregas',
        description: [
          'Consome `GET /integracao/pedidos` da API de Pedidos (G5), página por página, e valida cada pedido contra o Contrato B. Regras:',
          '',
          '- **Inclusão:** pedido `CONFIRMADO` que o G7 ainda não tem cria a entrega (`id_pedido` = `codigo_pedido`, `id_cliente` = `codigo_cliente`). O que o G5 não fornece fica em `pendencias`.',
          '- **Atualização:** `data_atualizacao` mais recente atualiza o endereço da entrega (só enquanto `AGUARDANDO_COLETA` ou `EM_TRANSITO`; depois, `REGRA_NEGOCIO` para tratamento manual).',
          '- **Cancelamento:** pedido `CANCELADO` cancela a entrega (se ainda não saiu para entrega). `CANCELADO` que nunca chegou confirmado é ignorado, sem erro.',
          '- **Rejeições:** campo obrigatório nulo (`CAMPO_OBRIGATORIO`), tipo errado (`TIPO_INVALIDO`), CEP/UF/valor/quantidade/data inválidos (`VALOR_INVALIDO`), `codigo_pedido` repetido (`REGISTRO_DUPLICADO`) e `REGRA_NEGOCIO`. Um pedido com problema não interrompe os demais e volta a ser lido na próxima execução.',
          '- **Idempotente:** reexecutar não duplica (`pedidos_importados` guarda a última leitura).',
          '- **Comunicação:** timeout de 5 s, até 3 repetições (1, 2 e 4 s) em falha de rede, timeout e 503; 500/502 repetem uma vez; 4xx não repetem.',
          '',
          'Requer a chave de escrita. Equivalente ao script `npm run importar:pedidos`.',
        ].join('\n'),
        security: secured,
        parameters: [requestId],
        responses: {
          '200': { description: 'Resumo da importação', ...json(ref('ResumoImportacao')) },
          '401': resp('NaoAutenticado'),
          '403': resp('SemPermissao'),
          '502': respostaErro('G5 fora do contrato, recusou a chave ou respondeu erro', 502, 'INTEGRACAO_CONTRATO_INVALIDO'),
          '503': respostaErro('API de Pedidos (G5) indisponível', 503, 'INTEGRACAO_INDISPONIVEL'),
        },
      },
    },
    '/integracoes/pedidos': {
      get: {
        tags: ['Integração G5 (interno)'],
        summary: 'Listar pedidos já importados do G5',
        security: secured,
        parameters: [requestId, { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }],
        responses: {
          '200': { description: 'Pedidos importados, do maior código para o menor', ...json({ type: 'object', properties: { dados: { type: 'array', items: ref('PedidoImportado') } } }) },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
        },
      },
    },
    '/integracoes/logs': {
      get: {
        tags: ['Integração G5 (interno)'],
        summary: 'Consultar o registro de ocorrências da integração com o G5',
        security: secured,
        parameters: [
          requestId,
          { name: 'importacao_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: {
          '200': { description: 'Logs, do mais recente para o mais antigo', ...json({ type: 'object', properties: { dados: { type: 'array', items: ref('LogIntegracao') } } }) },
          '400': resp('RequisicaoInvalida'),
          '401': resp('NaoAutenticado'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Chave de leitura/escrita ou chave somente leitura (403 em métodos de escrita).',
      },
    },
    parameters: {
      IdEntrega: { name: 'id_entrega', in: 'path', required: true, schema: { type: 'integer', minimum: 1 }, example: 701 },
      XRequestId: {
        name: 'X-Request-Id',
        in: 'header',
        required: false,
        description: 'UUID gerado pelo consumidor. Devolvido na resposta e no corpo de erro; a API gera um se ausente.',
        schema: { type: 'string', format: 'uuid' },
      },
    },
    responses: {
      RequisicaoInvalida: respostaErro('JSON malformado, campo obrigatório ausente, tipo errado, Content-Type inválido ou parâmetro inválido', 400, 'REQUISICAO_INVALIDA', [
        { campo: 'id_cliente', problema: 'campo obrigatório' },
      ]),
      NaoAutenticado: respostaErro('X-API-Key ausente ou inválida', 401, 'NAO_AUTENTICADO'),
      SemPermissao: respostaErro('Chave sem permissão de escrita', 403, 'SEM_PERMISSAO'),
      NaoEncontrado: respostaErro('Entrega ou rota inexistente', 404, 'NAO_ENCONTRADO'),
      Conflito: respostaErro('ENTREGA_DUPLICADA, TRANSICAO_INVALIDA ou OPERACAO_NAO_PERMITIDA', 409, 'ENTREGA_DUPLICADA'),
      ValidacaoSemantica: respostaErro('Valor com tipo correto que viola formato, faixa ou regra de negócio', 422, 'VALIDACAO_SEMANTICA', [
        { campo: 'data_prevista', problema: 'não pode ser anterior a 2026-11-11' },
        { campo: 'endereco_destino.uf', problema: "UF 'XX' inexistente" },
      ]),
      ErroInterno: respostaErro('Erro inesperado no servidor', 500, 'ERRO_INTERNO'),
      ServicoIndisponivel: {
        ...respostaErro('API ou banco de dados temporariamente indisponível', 503, 'SERVICO_INDISPONIVEL'),
        headers: { 'Retry-After': { description: 'Segundos até a nova tentativa', schema: { type: 'integer', example: 5 } } },
      },
    },
    schemas: {
      StatusEntrega: { type: 'string', enum: STATUS },
      EnderecoDestinoEntrada: {
        type: 'object',
        required: ['logradouro', 'numero', 'bairro', 'cidade', 'uf', 'cep'],
        properties: {
          logradouro: { type: 'string', minLength: 3, maxLength: 120 },
          numero: { type: 'string', minLength: 1, maxLength: 10, description: 'Aceita "S/N"' },
          complemento: { type: 'string', nullable: true, maxLength: 60 },
          bairro: { type: 'string', minLength: 2, maxLength: 60 },
          cidade: { type: 'string', minLength: 2, maxLength: 60 },
          uf: { type: 'string', pattern: '^[A-Z]{2}$', description: 'Uma das 27 UFs, maiúscula' },
          cep: { type: 'string', pattern: '^\\d{5}-\\d{3}$' },
        },
      },
      EnderecoDestino: {
        type: 'object',
        description: '`numero` e `bairro` podem ser nulos em entregas importadas do G5 (ver `pendencias`).',
        properties: {
          logradouro: { type: 'string' },
          numero: { type: 'string', nullable: true },
          complemento: { type: 'string', nullable: true },
          bairro: { type: 'string', nullable: true },
          cidade: { type: 'string' },
          uf: { type: 'string' },
          cep: { type: 'string' },
        },
      },
      EntregaCriar: {
        type: 'object',
        required: ['id_pedido', 'id_cliente', 'nome_destinatario', 'transportadora', 'endereco_destino', 'data_prevista', 'valor_frete'],
        properties: {
          id_pedido: { type: 'integer', minimum: 1, description: 'Único entre entregas não canceladas' },
          id_cliente: { type: 'integer', minimum: 1 },
          nome_destinatario: { type: 'string', minLength: 3, maxLength: 100 },
          transportadora: { type: 'string', minLength: 2, maxLength: 60 },
          endereco_destino: ref('EnderecoDestinoEntrada'),
          data_prevista: { type: 'string', format: 'date', description: 'Não pode ser anterior à data atual (America/Sao_Paulo)' },
          valor_frete: { type: 'number', minimum: 0, maximum: 9999.99, description: 'Até 2 casas decimais' },
        },
      },
      EntregaAtualizar: {
        type: 'object',
        required: ['nome_destinatario', 'transportadora', 'endereco_destino', 'data_prevista', 'valor_frete'],
        properties: {
          nome_destinatario: { type: 'string', minLength: 3, maxLength: 100 },
          transportadora: { type: 'string', minLength: 2, maxLength: 60 },
          endereco_destino: ref('EnderecoDestinoEntrada'),
          data_prevista: { type: 'string', format: 'date' },
          valor_frete: { type: 'number', minimum: 0, maximum: 9999.99 },
          id_cliente: { type: 'integer', minimum: 1, description: 'Só aceito para preencher a pendência de entrega importada; depois é imutável' },
          id_pedido: { type: 'integer', description: 'Opcional; se enviado, deve ser igual ao gravado' },
        },
        example: {
          nome_destinatario: 'Maria Souza Lima',
          transportadora: 'Correios',
          endereco_destino: exemploEntrega.endereco_destino,
          data_prevista: '2026-11-22',
          valor_frete: 25.9,
        },
      },
      AlterarStatus: {
        type: 'object',
        required: ['status_entrega'],
        properties: {
          status_entrega: ref('StatusEntrega'),
          observacao: { type: 'string', nullable: true, maxLength: 200 },
          data_entrega: { type: 'string', format: 'date', nullable: true, description: 'Obrigatória com ENTREGUE (não futura); proibida nos demais' },
        },
      },
      Entrega: {
        type: 'object',
        properties: {
          id_entrega: { type: 'integer', readOnly: true },
          codigo_rastreio: { type: 'string', readOnly: true, example: 'ENT-2026-000701' },
          id_pedido: { type: 'integer' },
          id_cliente: { type: 'integer', nullable: true },
          nome_destinatario: { type: 'string' },
          transportadora: { type: 'string', nullable: true },
          endereco_destino: ref('EnderecoDestino'),
          data_prevista: { type: 'string', format: 'date', nullable: true },
          valor_frete: { type: 'number', nullable: true },
          status_entrega: ref('StatusEntrega'),
          data_entrega: { type: 'string', format: 'date', nullable: true },
          origem: { type: 'string', enum: ['API', 'PEDIDOS_G5'], description: 'PEDIDOS_G5: criada pela importação de pedidos do G5' },
          pendencias: {
            type: 'array',
            items: { type: 'string' },
            description: 'Campos ainda nulos a completar via PUT (vazia em entregas cadastradas pelo POST)',
            example: ['id_cliente', 'transportadora', 'valor_frete'],
          },
          data_criacao: { type: 'string', format: 'date-time', readOnly: true },
          data_atualizacao: { type: 'string', format: 'date-time', readOnly: true },
        },
      },
      ListaEntregas: {
        type: 'object',
        properties: {
          dados: { type: 'array', items: ref('Entrega') },
          paginacao: {
            type: 'object',
            properties: {
              pagina: { type: 'integer' },
              tamanho: { type: 'integer' },
              total_registros: { type: 'integer' },
              total_paginas: { type: 'integer' },
            },
          },
        },
      },
      HistoricoItem: {
        type: 'object',
        properties: {
          status_entrega: ref('StatusEntrega'),
          data_hora: { type: 'string', format: 'date-time' },
          observacao: { type: 'string', nullable: true },
        },
      },
      ListaHistorico: { type: 'object', properties: { dados: { type: 'array', items: ref('HistoricoItem') } } },
      Erro: {
        type: 'object',
        properties: {
          erro: {
            type: 'object',
            properties: {
              status: { type: 'integer' },
              codigo: {
                type: 'string',
                enum: [
                  'REQUISICAO_INVALIDA', 'NAO_AUTENTICADO', 'SEM_PERMISSAO', 'NAO_ENCONTRADO', 'ENTREGA_DUPLICADA',
                  'TRANSICAO_INVALIDA', 'OPERACAO_NAO_PERMITIDA', 'VALIDACAO_SEMANTICA', 'ERRO_INTERNO',
                  'SERVICO_INDISPONIVEL', 'INTEGRACAO_INDISPONIVEL', 'INTEGRACAO_CONTRATO_INVALIDO',
                  'INTEGRACAO_AUTENTICACAO', 'INTEGRACAO_ERRO',
                ],
              },
              mensagem: { type: 'string' },
              detalhes: {
                type: 'array',
                description: 'Obrigatório (não vazio) em 400 e 422',
                items: {
                  type: 'object',
                  properties: { campo: { type: 'string' }, problema: { type: 'string' } },
                },
              },
            },
          },
          caminho: { type: 'string' },
          data_hora: { type: 'string', format: 'date-time' },
          request_id: { type: 'string', format: 'uuid' },
        },
      },
      ResumoImportacao: {
        type: 'object',
        properties: {
          importacao_id: { type: 'string', format: 'uuid' },
          consultados: { type: 'integer', description: 'Pedidos lidos do G5 (válidos e inválidos)' },
          inseridos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                codigo_pedido: { type: 'integer' },
                id_entrega: { type: 'integer' },
                codigo_rastreio: { type: 'string' },
                pendencias: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          atualizados: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                codigo_pedido: { type: 'integer' },
                acao: { type: 'string', enum: ['ENDERECO_ATUALIZADO', 'ENTREGA_CANCELADA', 'DADOS_ATUALIZADOS'] },
              },
            },
          },
          sem_alteracao: { type: 'array', items: { type: 'integer' }, description: 'codigo_pedido sem mudança desde a última leitura' },
          ignorados: {
            type: 'array',
            items: { type: 'object', properties: { codigo_pedido: { type: 'integer' }, motivo: { type: 'string' } } },
          },
          rejeitados: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                codigo_pedido: { type: 'integer', nullable: true },
                tipo_erro: { type: 'string', enum: ['CAMPO_OBRIGATORIO', 'TIPO_INVALIDO', 'VALOR_INVALIDO', 'REGISTRO_DUPLICADO', 'REGRA_NEGOCIO'] },
                campo: { type: 'string' },
                motivo: { type: 'string' },
              },
            },
          },
        },
      },
      PedidoImportado: {
        type: 'object',
        description: 'Última leitura do pedido no G5 (campos do Contrato B).',
        properties: {
          codigo_pedido: { type: 'integer' },
          codigo_cliente: { type: 'integer' },
          nome_cliente: { type: 'string' },
          endereco_entrega: { type: 'string' },
          cidade_entrega: { type: 'string' },
          uf_entrega: { type: 'string' },
          cep_entrega: { type: 'string' },
          data_pedido: { type: 'string', format: 'date-time' },
          quantidade_itens: { type: 'integer' },
          valor_total: { type: 'number' },
          status_pedido: { type: 'string', enum: ['CONFIRMADO', 'CANCELADO'] },
          origem_atualizado_em: { type: 'string', format: 'date-time', description: 'data_atualizacao do G5 na última leitura' },
          id_entrega: { type: 'integer', nullable: true },
          ultima_importacao_id: { type: 'string', format: 'uuid' },
          importado_em: { type: 'string', format: 'date-time' },
          atualizado_em: { type: 'string', format: 'date-time' },
        },
      },
      LogIntegracao: {
        type: 'object',
        properties: {
          data_hora: { type: 'string', format: 'date-time' },
          importacao_id: { type: 'string', format: 'uuid', nullable: true },
          request_id: { type: 'string', format: 'uuid', nullable: true },
          metodo: { type: 'string', example: 'GET' },
          endpoint: { type: 'string', example: '/integracao/pedidos?pagina=1&tamanho=100' },
          status_http: { type: 'integer', nullable: true },
          tipo_ocorrencia: {
            type: 'string',
            enum: [
              'SUCESSO', 'ERRO_HTTP', 'TIMEOUT', 'INDISPONIVEL', 'VIOLACAO_CONTRATO', 'REGISTRO_DUPLICADO',
              'CONFLITO', 'REGRA_NEGOCIO', 'IGNORADO', 'RECONCILIACAO',
            ],
          },
          erro_codigo: { type: 'string', nullable: true, description: 'erro.codigo devolvido pelo G5 ou tipo de erro do Contrato B' },
          descricao: { type: 'string' },
          acao_tomada: { type: 'string' },
          tentativa: { type: 'integer' },
          duracao_ms: { type: 'integer', nullable: true },
        },
      },
    },
  },
};
