import { z } from 'zod';
import { erros, type DetalheErro } from './errors';

export const INT32_MAX = 2_147_483_647;
const INTEIRO_POSITIVO = /^[1-9]\d*$/;

export function parseIdRota(valor: unknown, campo: string): number {
  const bruto = String(valor);
  if (!INTEIRO_POSITIVO.test(bruto) || Number(bruto) > INT32_MAX) {
    throw erros.requisicaoInvalida([{ campo, problema: 'deve ser um inteiro positivo' }]);
  }
  return Number(bruto);
}

/** Lê um inteiro positivo de query string; problemas são acumulados em `detalhes`. */
export function lerInteiroQuery(
  detalhes: DetalheErro[],
  campo: string,
  valor: unknown,
  max = INT32_MAX,
): number | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !INTEIRO_POSITIVO.test(valor) || Number(valor) > max) {
    detalhes.push({ campo, problema: `deve ser um inteiro positivo${max < INT32_MAX ? ` (máximo ${max})` : ''}` });
    return undefined;
  }
  return Number(valor);
}

export function lerPaginacao(
  detalhes: DetalheErro[],
  query: Record<string, unknown>,
): { pagina: number; tamanho: number } {
  return {
    pagina: lerInteiroQuery(detalhes, 'pagina', query.pagina) ?? 1,
    tamanho: lerInteiroQuery(detalhes, 'tamanho', query.tamanho, 100) ?? 20,
  };
}

export function lancarSeHouver400(detalhes: DetalheErro[]): void {
  if (detalhes.length > 0) throw erros.requisicaoInvalida(detalhes);
}

const TIPOS: Record<string, string> = {
  string: 'texto',
  number: 'número',
  int: 'inteiro',
  integer: 'inteiro',
  object: 'objeto',
  boolean: 'booleano',
  array: 'lista',
};

function lerCaminho(origem: unknown, caminho: PropertyKey[]): unknown {
  let atual: unknown = origem;
  for (const chave of caminho) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = (atual as Record<PropertyKey, unknown>)[chave];
  }
  return atual;
}

/** Valida só a estrutura do corpo (presença e tipo JSON); qualquer problema vira 400 com um detalhe por campo. */
export function validarEstrutura<T>(schema: z.ZodType<T>, corpo: unknown): T {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    throw erros.requisicaoInvalida([{ campo: 'body', problema: 'o corpo deve ser um objeto JSON' }]);
  }
  const resultado = schema.safeParse(corpo);
  if (resultado.success) return resultado.data;

  throw erros.requisicaoInvalida(
    resultado.error.issues.map((issue) => {
      const ausente = lerCaminho(corpo, issue.path) === undefined;
      const esperado = (issue as { expected?: unknown }).expected;
      return {
        campo: issue.path.join('.'),
        problema: ausente ? 'campo obrigatório' : `tipo inválido (esperado ${TIPOS[String(esperado)] ?? 'outro tipo'})`,
      };
    }),
  );
}

export function pagina<T>(dados: T[], total: number, paginaAtual: number, tamanho: number) {
  return {
    dados,
    paginacao: {
      pagina: paginaAtual,
      tamanho,
      total_registros: total,
      total_paginas: Math.ceil(total / tamanho),
    },
  };
}
