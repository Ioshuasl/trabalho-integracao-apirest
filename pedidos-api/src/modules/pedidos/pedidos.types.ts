import type { StatusPedido } from './status';

/** Um pedido por linha, exatamente os campos do Contrato B (vw_integracao_pedidos). */
export interface PedidoResumo {
  codigo_pedido: number;
  codigo_cliente: number;
  nome_cliente: string;
  endereco_entrega: string;
  cidade_entrega: string;
  uf_entrega: string;
  cep_entrega: string;
  data_pedido: string;
  quantidade_itens: number;
  valor_total: number;
  status_pedido: StatusPedido;
  data_atualizacao: string;
}

export interface ItemPedido {
  id_item: number;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
}

export interface Pedido extends PedidoResumo {
  itens: ItemPedido[];
}

export interface PedidoResumoRow {
  codigo_pedido: number;
  codigo_cliente: number;
  nome_cliente: string;
  endereco_entrega: string;
  cidade_entrega: string;
  uf_entrega: string;
  cep_entrega: string;
  data_pedido: Date;
  quantidade_itens: number;
  valor_total: string;
  status_pedido: StatusPedido;
  data_atualizacao: Date;
}

export interface FiltrosPedidos {
  status_pedido?: StatusPedido;
  codigo_cliente?: number;
  pagina: number;
  tamanho: number;
}
