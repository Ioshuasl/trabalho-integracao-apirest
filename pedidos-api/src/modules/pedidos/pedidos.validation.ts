import { erros, type DetalheErro } from '../../shared/http/errors';
import { UFS } from '../../shared/uf';
import type { EnderecoInput, ItemInput } from './pedidos.schemas';
import { isStatusPedido, type StatusPedido } from './status';

/* Validações SEMÂNTICAS (falha => 422): tipo JSON correto, mas valor fora de formato, tamanho, faixa ou regra. */

const VALOR_MAXIMO = 99_999_999.99; // NUMERIC(10,2)

export function lancarSeHouver(detalhes: DetalheErro[]): void {
  if (detalhes.length > 0) throw erros.validacaoSemantica(detalhes);
}

function texto(campo: string, valor: string, max: number, d: DetalheErro[]): void {
  if (valor.trim().length === 0) d.push({ campo, problema: 'não pode ser vazio' });
  else if (valor.length > max) d.push({ campo, problema: `deve ter no máximo ${max} caracteres` });
}

const duasCasas = (valor: number) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;

export function validarEndereco(e: EnderecoInput): DetalheErro[] {
  const d: DetalheErro[] = [];
  texto('endereco_entrega', e.endereco_entrega, 200, d);
  texto('cidade_entrega', e.cidade_entrega, 80, d);
  if (!/^[A-Z]{2}$/.test(e.uf_entrega)) d.push({ campo: 'uf_entrega', problema: 'deve ter 2 letras maiúsculas' });
  else if (!UFS.has(e.uf_entrega)) d.push({ campo: 'uf_entrega', problema: `UF '${e.uf_entrega}' inexistente` });
  if (!/^\d{8}$/.test(e.cep_entrega)) d.push({ campo: 'cep_entrega', problema: 'deve ter 8 dígitos, somente números' });
  return d;
}

export function validarItens(itens: ItemInput[]): DetalheErro[] {
  const d: DetalheErro[] = [];
  if (itens.length === 0) {
    d.push({ campo: 'itens', problema: 'deve ter ao menos 1 item' });
    return d;
  }
  itens.forEach((item, i) => {
    texto(`itens.${i}.descricao`, item.descricao, 100, d);
    if (item.quantidade <= 0) d.push({ campo: `itens.${i}.quantidade`, problema: 'deve ser maior que zero' });
    if (item.preco_unitario <= 0 || item.preco_unitario > VALOR_MAXIMO) {
      d.push({ campo: `itens.${i}.preco_unitario`, problema: 'deve ser maior que zero' });
    } else if (!duasCasas(item.preco_unitario)) {
      d.push({ campo: `itens.${i}.preco_unitario`, problema: 'deve ter no máximo 2 casas decimais' });
    }
  });
  if (d.length === 0 && calcularTotal(itens) > VALOR_MAXIMO) {
    d.push({ campo: 'itens', problema: `valor total excede ${VALOR_MAXIMO}` });
  }
  return d;
}

/** Soma em centavos para não acumular erro de ponto flutuante. */
export function calcularTotal(itens: ItemInput[]): number {
  return itens.reduce((total, item) => total + Math.round(item.preco_unitario * 100) * item.quantidade, 0) / 100;
}

/** Valor fora do enum é 422; valor válido mas transição proibida é 409 (tratado no serviço). */
export function exigirStatusValido(valor: string): StatusPedido {
  if (!isStatusPedido(valor)) {
    throw erros.validacaoSemantica([{ campo: 'status_pedido', problema: `valor '${valor}' fora do enum permitido` }]);
  }
  return valor;
}
