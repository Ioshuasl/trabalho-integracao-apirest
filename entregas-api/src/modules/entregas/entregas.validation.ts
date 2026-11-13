import { dataValida, hoje } from '../../shared/datetime';
import { erros, type DetalheErro } from '../../shared/http/errors';
import type {
  AlterarStatusInput,
  AtualizarEntregaInput,
  CriarEntregaInput,
  DadosEditaveisInput,
  EnderecoInput,
} from './entregas.schemas';
import type { Entrega } from './entregas.types';
import { isStatus, type StatusEntrega } from './status';

/*
 * Validações SEMÂNTICAS (falha => 422): o tipo JSON já está correto, mas o valor
 * viola formato, tamanho, faixa, enum ou regra de negócio (contrato, seção 3.5).
 */

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export function lancarSeHouver(detalhes: DetalheErro[]): void {
  if (detalhes.length > 0) throw erros.validacaoSemantica(detalhes);
}

function tamanho(campo: string, valor: string, min: number, max: number, detalhes: DetalheErro[]): void {
  if (valor.length < min || valor.length > max) {
    detalhes.push({ campo, problema: `deve ter de ${min} a ${max} caracteres` });
  }
}

export function validarEndereco(e: EnderecoInput): DetalheErro[] {
  const d: DetalheErro[] = [];
  tamanho('endereco_destino.logradouro', e.logradouro, 3, 120, d);
  tamanho('endereco_destino.numero', e.numero, 1, 10, d);
  if (e.complemento != null && e.complemento.length > 60) {
    d.push({ campo: 'endereco_destino.complemento', problema: 'deve ter no máximo 60 caracteres' });
  }
  tamanho('endereco_destino.bairro', e.bairro, 2, 60, d);
  tamanho('endereco_destino.cidade', e.cidade, 2, 60, d);

  if (!/^[A-Z]{2}$/.test(e.uf)) {
    d.push({ campo: 'endereco_destino.uf', problema: 'deve ter 2 letras maiúsculas' });
  } else if (!UFS.has(e.uf)) {
    d.push({ campo: 'endereco_destino.uf', problema: `UF '${e.uf}' inexistente` });
  }

  if (!/^\d{5}-\d{3}$/.test(e.cep)) {
    d.push({ campo: 'endereco_destino.cep', problema: 'formato esperado: 00000-000' });
  }
  return d;
}

function validarFrete(valor: number): DetalheErro[] {
  if (valor < 0 || valor > 9999.99) {
    return [{ campo: 'valor_frete', problema: 'deve estar entre 0,00 e 9999,99' }];
  }
  if (Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6) {
    return [{ campo: 'valor_frete', problema: 'deve ter no máximo 2 casas decimais' }];
  }
  return [];
}

function validarDataPrevista(valor: string): DetalheErro[] {
  if (!dataValida(valor)) return [{ campo: 'data_prevista', problema: 'formato esperado: AAAA-MM-DD (data existente)' }];
  const atual = hoje();
  if (valor < atual) return [{ campo: 'data_prevista', problema: `não pode ser anterior a ${atual}` }];
  return [];
}

function validarDadosEditaveis(dados: DadosEditaveisInput, validarData: boolean): DetalheErro[] {
  const d: DetalheErro[] = [];
  if (dados.nome_destinatario.trim().length === 0) {
    d.push({ campo: 'nome_destinatario', problema: 'não pode conter apenas espaços' });
  } else {
    tamanho('nome_destinatario', dados.nome_destinatario, 3, 100, d);
  }
  tamanho('transportadora', dados.transportadora, 2, 60, d);
  d.push(...validarEndereco(dados.endereco_destino));
  if (validarData) d.push(...validarDataPrevista(dados.data_prevista));
  d.push(...validarFrete(dados.valor_frete));
  return d;
}

export function validarCriacao(dados: CriarEntregaInput): DetalheErro[] {
  const d: DetalheErro[] = [];
  if (dados.id_pedido <= 0) d.push({ campo: 'id_pedido', problema: 'deve ser maior que zero' });
  if (dados.id_cliente <= 0) d.push({ campo: 'id_cliente', problema: 'deve ser maior que zero' });
  d.push(...validarDadosEditaveis(dados, true));
  return d;
}

/** PUT: a data prevista só é revalidada se mudou; campos imutáveis não podem divergir do gravado. */
export function validarAtualizacao(dados: AtualizarEntregaInput, atual: Entrega): DetalheErro[] {
  const d: DetalheErro[] = [];
  if (dados.id_pedido !== undefined && dados.id_pedido !== atual.id_pedido) {
    d.push({ campo: 'id_pedido', problema: 'não pode ser alterado' });
  }
  if (dados.id_cliente !== undefined) {
    if (atual.id_cliente === null) {
      // pendência de entrega importada: o PUT pode preenchê-la uma vez
      if (dados.id_cliente <= 0) d.push({ campo: 'id_cliente', problema: 'deve ser maior que zero' });
    } else if (dados.id_cliente !== atual.id_cliente) {
      d.push({ campo: 'id_cliente', problema: 'não pode ser alterado' });
    }
  }
  if (dados.status_entrega !== undefined && dados.status_entrega !== atual.status_entrega) {
    d.push({ campo: 'status_entrega', problema: 'só pode ser alterado por PATCH /entregas/{id}/status' });
  }
  if (dados.data_entrega !== undefined && dados.data_entrega !== atual.data_entrega) {
    d.push({ campo: 'data_entrega', problema: 'só pode ser alterada por PATCH /entregas/{id}/status' });
  }
  d.push(...validarDadosEditaveis(dados, dados.data_prevista !== atual.data_prevista));
  return d;
}

/** Limites das colunas do banco: o que o G2 envia precisa caber, sem truncar em silêncio. */
export function validarImportacao(dados: {
  nome_destinatario: string;
  logradouro: string;
  cidade: string;
  uf: string;
  cep: string;
}): DetalheErro[] {
  const d: DetalheErro[] = [];
  const faixa = (campo: string, valor: string, max: number) => {
    if (valor.trim().length === 0 || valor.length > max) d.push({ campo, problema: `deve ter de 1 a ${max} caracteres` });
  };
  faixa('nome_destinatario', dados.nome_destinatario, 100);
  faixa('endereco_destino.logradouro', dados.logradouro, 200);
  faixa('endereco_destino.cidade', dados.cidade, 60);
  if (!UFS.has(dados.uf)) d.push({ campo: 'endereco_destino.uf', problema: `UF '${dados.uf}' inexistente` });
  if (!/^\d{5}-\d{3}$/.test(dados.cep)) d.push({ campo: 'endereco_destino.cep', problema: 'formato esperado: 00000-000' });
  return d;
}

/** Valor fora do enum não tem transição possível: é 422 antes mesmo da checagem de transição (409). */
export function exigirStatusValido(valor: string): StatusEntrega {
  if (!isStatus(valor)) {
    throw erros.validacaoSemantica([{ campo: 'status_entrega', problema: `valor '${valor}' fora do enum permitido` }]);
  }
  return valor;
}

/** PATCH /status: observação e data_entrega (obrigatória só em ENTREGUE, nunca futura). */
export function validarAlteracaoStatus(dados: AlterarStatusInput, novoStatus: StatusEntrega): DetalheErro[] {
  const d: DetalheErro[] = [];
  if (dados.observacao != null && dados.observacao.length > 200) {
    d.push({ campo: 'observacao', problema: 'deve ter no máximo 200 caracteres' });
  }

  const dataEntrega = dados.data_entrega ?? null;
  if (novoStatus === 'ENTREGUE') {
    if (dataEntrega === null) {
      d.push({ campo: 'data_entrega', problema: 'obrigatória quando o status é ENTREGUE' });
    } else if (!dataValida(dataEntrega)) {
      d.push({ campo: 'data_entrega', problema: 'formato esperado: AAAA-MM-DD (data existente)' });
    } else if (dataEntrega > hoje()) {
      d.push({ campo: 'data_entrega', problema: 'não pode ser futura' });
    }
  } else if (dataEntrega !== null) {
    d.push({ campo: 'data_entrega', problema: 'só pode ser informada quando o status é ENTREGUE' });
  }
  return d;
}
