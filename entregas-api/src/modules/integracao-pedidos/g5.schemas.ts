import { UFS } from '../../shared/uf';

/*
 * Validação de cada pedido recebido do G5 contra o Contrato B (campos, tipos, tamanhos e regras).
 * O consumidor não confia nos dados: cada problema vira um item com o tipo de erro do contrato.
 */

export type TipoErroPedido = 'CAMPO_OBRIGATORIO' | 'TIPO_INVALIDO' | 'VALOR_INVALIDO';

export interface ProblemaPedido {
  campo: string;
  tipo: TipoErroPedido;
  descricao: string;
}

export interface PedidoG5 {
  codigo_pedido: number;
  codigo_cliente: number;
  nome_cliente: string;
  endereco_entrega: string;
  cidade_entrega: string;
  uf_entrega: string;
  cep_entrega: string;
  data_pedido: Date;
  quantidade_itens: number;
  valor_total: number;
  status_pedido: 'CONFIRMADO' | 'CANCELADO';
  data_atualizacao: Date;
}

const FOLGA_RELOGIO_MS = 5 * 60 * 1000;

export function validarPedidoG5(bruto: unknown): { pedido: PedidoG5 } | { problemas: ProblemaPedido[] } {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { problemas: [{ campo: '(registro)', tipo: 'TIPO_INVALIDO', descricao: 'o registro deve ser um objeto' }] };
  }
  const r = bruto as Record<string, unknown>;
  const problemas: ProblemaPedido[] = [];

  const ausente = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const problema = (campo: string, tipo: TipoErroPedido, descricao: string) => problemas.push({ campo, tipo, descricao });

  const inteiro = (campo: string): number | undefined => {
    const v = r[campo];
    if (ausente(v)) return void problema(campo, 'CAMPO_OBRIGATORIO', 'campo obrigatório ausente ou nulo');
    if (typeof v !== 'number' || !Number.isInteger(v)) return void problema(campo, 'TIPO_INVALIDO', `esperado inteiro, recebido ${JSON.stringify(v)}`);
    if (v <= 0) return void problema(campo, 'VALOR_INVALIDO', 'deve ser maior que zero');
    return v;
  };

  const texto = (campo: string, max: number): string | undefined => {
    const v = r[campo];
    if (ausente(v)) return void problema(campo, 'CAMPO_OBRIGATORIO', 'campo obrigatório ausente, nulo ou vazio');
    if (typeof v !== 'string') return void problema(campo, 'TIPO_INVALIDO', `esperado texto, recebido ${JSON.stringify(v)}`);
    const aparado = v.trim();
    if (aparado.length > max) return void problema(campo, 'VALOR_INVALIDO', `deve ter no máximo ${max} caracteres`);
    return aparado;
  };

  const dataHora = (campo: string): Date | undefined => {
    const v = r[campo];
    if (ausente(v)) return void problema(campo, 'CAMPO_OBRIGATORIO', 'campo obrigatório ausente ou nulo');
    const data = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : null;
    if (!data || Number.isNaN(data.getTime())) return void problema(campo, 'TIPO_INVALIDO', `data/hora ISO 8601 inválida: ${JSON.stringify(v)}`);
    return data;
  };

  const codigo_pedido = inteiro('codigo_pedido');
  const codigo_cliente = inteiro('codigo_cliente');
  const nome_cliente = texto('nome_cliente', 100);
  const endereco_entrega = texto('endereco_entrega', 200);
  const cidade_entrega = texto('cidade_entrega', 80);
  const quantidade_itens = inteiro('quantidade_itens');
  const data_pedido = dataHora('data_pedido');
  const data_atualizacao = dataHora('data_atualizacao');

  let uf = texto('uf_entrega', 2)?.toUpperCase();
  if (uf !== undefined && !UFS.has(uf)) {
    problema('uf_entrega', 'VALOR_INVALIDO', `UF '${uf}' inexistente`);
    uf = undefined;
  }

  let cep = texto('cep_entrega', 8);
  if (cep !== undefined && !/^\d{8}$/.test(cep)) {
    problema('cep_entrega', 'VALOR_INVALIDO', 'deve ter 8 dígitos, somente números');
    cep = undefined;
  }

  let valor_total: number | undefined;
  const vt = r.valor_total;
  if (ausente(vt)) problema('valor_total', 'CAMPO_OBRIGATORIO', 'campo obrigatório ausente ou nulo');
  else if (typeof vt !== 'number') problema('valor_total', 'TIPO_INVALIDO', `esperado número, recebido ${JSON.stringify(vt)}`);
  else if (vt <= 0) problema('valor_total', 'VALOR_INVALIDO', 'deve ser maior que zero');
  else if (Math.abs(vt * 100 - Math.round(vt * 100)) > 1e-6) problema('valor_total', 'VALOR_INVALIDO', 'deve ter no máximo 2 casas decimais');
  else valor_total = vt;

  let status_pedido: PedidoG5['status_pedido'] | undefined;
  const st = texto('status_pedido', 20);
  if (st !== undefined) {
    if (st === 'CONFIRMADO' || st === 'CANCELADO') status_pedido = st;
    else problema('status_pedido', 'VALOR_INVALIDO', `'${st}' fora do enum (CONFIRMADO ou CANCELADO)`);
  }

  if (data_pedido && data_pedido.getTime() > Date.now() + FOLGA_RELOGIO_MS) {
    problema('data_pedido', 'VALOR_INVALIDO', 'não pode ser futura');
  }

  if (
    problemas.length > 0 ||
    codigo_pedido === undefined || codigo_cliente === undefined || nome_cliente === undefined ||
    endereco_entrega === undefined || cidade_entrega === undefined || uf === undefined || cep === undefined ||
    data_pedido === undefined || quantidade_itens === undefined || valor_total === undefined ||
    status_pedido === undefined || data_atualizacao === undefined
  ) {
    return { problemas };
  }

  return {
    pedido: {
      codigo_pedido, codigo_cliente, nome_cliente, endereco_entrega, cidade_entrega,
      uf_entrega: uf, cep_entrega: cep, data_pedido, quantidade_itens, valor_total, status_pedido, data_atualizacao,
    },
  };
}
