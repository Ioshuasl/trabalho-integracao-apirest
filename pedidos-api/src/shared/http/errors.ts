export interface DetalheErro {
  campo: string;
  problema: string;
}

export type CodigoErro =
  | 'REQUISICAO_INVALIDA'
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'TRANSICAO_INVALIDA'
  | 'OPERACAO_NAO_PERMITIDA'
  | 'VALIDACAO_SEMANTICA'
  | 'ERRO_INTERNO'
  | 'SERVICO_INDISPONIVEL';

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

/** Fábricas de erro: cada uma fixa o par status HTTP / erro.codigo do contrato. */
export const erros = {
  requisicaoInvalida: (detalhes: DetalheErro[]) =>
    new AppError(400, 'REQUISICAO_INVALIDA', 'A requisição é inválida.', detalhes),

  naoAutenticado: () => new AppError(401, 'NAO_AUTENTICADO', 'X-API-Key ausente ou inválida.'),

  semPermissao: () => new AppError(403, 'SEM_PERMISSAO', 'A chave informada não tem permissão para esta operação.'),

  naoEncontrado: (mensagem: string) => new AppError(404, 'NAO_ENCONTRADO', mensagem),

  transicaoInvalida: (de: string, para: string) =>
    new AppError(409, 'TRANSICAO_INVALIDA', `Transição de status não permitida: ${de} -> ${para}.`),

  operacaoNaoPermitida: (mensagem: string) => new AppError(409, 'OPERACAO_NAO_PERMITIDA', mensagem),

  validacaoSemantica: (detalhes: DetalheErro[]) =>
    new AppError(422, 'VALIDACAO_SEMANTICA', 'Um ou mais campos têm valores inválidos.', detalhes),

  erroInterno: () => new AppError(500, 'ERRO_INTERNO', 'Erro interno no servidor.'),

  servicoIndisponivel: (retryAfterSegundos = 5) =>
    new AppError(503, 'SERVICO_INDISPONIVEL', 'Serviço temporariamente indisponível.', [], {
      'Retry-After': String(retryAfterSegundos),
    }),
};
