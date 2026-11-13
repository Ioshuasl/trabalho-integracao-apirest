export interface DetalheErro {
  campo: string;
  problema: string;
}

export type CodigoErro =
  | 'REQUISICAO_INVALIDA'
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'ENTREGA_DUPLICADA'
  | 'TRANSICAO_INVALIDA'
  | 'OPERACAO_NAO_PERMITIDA'
  | 'VALIDACAO_SEMANTICA'
  | 'ERRO_INTERNO'
  | 'SERVICO_INDISPONIVEL'
  | 'INTEGRACAO_INDISPONIVEL'
  | 'INTEGRACAO_CONTRATO_INVALIDO'
  | 'INTEGRACAO_AUTENTICACAO'
  | 'INTEGRACAO_ERRO';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly detalhes: DetalheErro[] = [],
    readonly headers: Record<string, string> = {},
  ) {
    super(mensagem);
  }
}

/** Fábricas de erro: cada uma fixa o par status HTTP / erro.codigo do contrato (seções 4 e 5). */
export const erros = {
  requisicaoInvalida: (detalhes: DetalheErro[]) =>
    new AppError(400, 'REQUISICAO_INVALIDA', 'A requisição é inválida.', detalhes),

  naoAutenticado: () => new AppError(401, 'NAO_AUTENTICADO', 'X-API-Key ausente ou inválida.'),

  semPermissao: () => new AppError(403, 'SEM_PERMISSAO', 'A chave informada não tem permissão para esta operação.'),

  naoEncontrado: (mensagem: string) => new AppError(404, 'NAO_ENCONTRADO', mensagem),

  entregaDuplicada: (idPedido: number) =>
    new AppError(409, 'ENTREGA_DUPLICADA', `Já existe uma entrega ativa para o pedido ${idPedido}.`),

  transicaoInvalida: (de: string, para: string) =>
    new AppError(409, 'TRANSICAO_INVALIDA', `Transição de status não permitida: ${de} -> ${para}.`),

  operacaoNaoPermitida: (mensagem: string) => new AppError(409, 'OPERACAO_NAO_PERMITIDA', mensagem),

  validacaoSemantica: (detalhes: DetalheErro[]) =>
    new AppError(422, 'VALIDACAO_SEMANTICA', 'Um ou mais campos têm valores inválidos.', detalhes),

  erroInterno: () => new AppError(500, 'ERRO_INTERNO', 'Erro interno no servidor.'),

  // Falhas ao consumir APIs de outros grupos (rotas internas de integração)
  integracaoIndisponivel: (mensagem: string) =>
    new AppError(503, 'INTEGRACAO_INDISPONIVEL', mensagem, [], { 'Retry-After': '30' }),

  integracaoContratoInvalido: (mensagem: string) => new AppError(502, 'INTEGRACAO_CONTRATO_INVALIDO', mensagem),

  integracaoAutenticacao: (mensagem: string) => new AppError(502, 'INTEGRACAO_AUTENTICACAO', mensagem),

  integracaoErro: (mensagem: string) => new AppError(502, 'INTEGRACAO_ERRO', mensagem),

  servicoIndisponivel: (retryAfterSegundos = 5) =>
    new AppError(503, 'SERVICO_INDISPONIVEL', 'Serviço temporariamente indisponível.', [], {
      'Retry-After': String(retryAfterSegundos),
    }),
};
