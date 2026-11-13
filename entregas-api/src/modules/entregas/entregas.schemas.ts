import { z } from 'zod';
import { erros, type DetalheErro } from '../../shared/http/errors';

/*
 * Schemas ESTRUTURAIS: só verificam presença e tipo JSON (falha => 400).
 * Formato, tamanho, faixa e regras de negócio são verificados em entregas.validation.ts (falha => 422).
 */

const enderecoSchema = z.object({
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string().nullable().optional(),
  bairro: z.string(),
  cidade: z.string(),
  uf: z.string(),
  cep: z.string(),
});

const dadosEditaveis = {
  nome_destinatario: z.string(),
  transportadora: z.string(),
  endereco_destino: enderecoSchema,
  data_prevista: z.string(),
  valor_frete: z.number(),
};

export const criarEntregaSchema = z.object({
  id_pedido: z.number().int(),
  id_cliente: z.number().int(),
  ...dadosEditaveis,
});

/** PUT: campos editáveis obrigatórios; os demais são aceitos só para conferência (contrato 3.3). */
export const atualizarEntregaSchema = z.object({
  ...dadosEditaveis,
  id_pedido: z.number().int().optional(),
  id_cliente: z.number().int().optional(),
  status_entrega: z.string().optional(),
  data_entrega: z.string().nullable().optional(),
});

export const alterarStatusSchema = z.object({
  status_entrega: z.string(),
  observacao: z.string().nullable().optional(),
  data_entrega: z.string().nullable().optional(),
});

export type EnderecoInput = z.infer<typeof enderecoSchema>;
export type CriarEntregaInput = z.infer<typeof criarEntregaSchema>;
export type AtualizarEntregaInput = z.infer<typeof atualizarEntregaSchema>;
export type AlterarStatusInput = z.infer<typeof alterarStatusSchema>;
export type DadosEditaveisInput = Pick<
  CriarEntregaInput,
  'nome_destinatario' | 'transportadora' | 'endereco_destino' | 'data_prevista' | 'valor_frete'
>;

const TIPOS: Record<string, string> = {
  string: 'texto',
  number: 'número',
  int: 'inteiro',
  integer: 'inteiro',
  object: 'objeto',
  boolean: 'booleano',
};

function lerCaminho(origem: unknown, caminho: PropertyKey[]): unknown {
  let atual: unknown = origem;
  for (const chave of caminho) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = (atual as Record<PropertyKey, unknown>)[chave];
  }
  return atual;
}

/** Valida a estrutura do corpo; qualquer problema vira 400 com um detalhe por campo. */
export function validarEstrutura<T>(schema: z.ZodType<T>, corpo: unknown): T {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    throw erros.requisicaoInvalida([{ campo: 'body', problema: 'o corpo deve ser um objeto JSON' }]);
  }

  const resultado = schema.safeParse(corpo);
  if (resultado.success) return resultado.data;

  const detalhes: DetalheErro[] = resultado.error.issues.map((issue) => {
    const ausente = lerCaminho(corpo, issue.path) === undefined;
    const esperado = (issue as { expected?: unknown }).expected;
    return {
      campo: issue.path.join('.'),
      problema: ausente
        ? 'campo obrigatório'
        : `tipo inválido (esperado ${TIPOS[String(esperado)] ?? 'outro tipo'})`,
    };
  });
  throw erros.requisicaoInvalida(detalhes);
}
