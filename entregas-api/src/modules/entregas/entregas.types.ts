import type { StatusEntrega } from './status';

export interface EnderecoDestino {
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string;
}

export type OrigemEntrega = 'API' | 'PEDIDOS_G5';

/**
 * Objeto entrega (contrato, seção 3.1) mais `origem` e `pendencias`.
 * Entregas importadas de pedidos do G5 nascem com alguns campos nulos; `pendencias`
 * lista os campos que o Grupo 7 ainda precisa completar via PUT.
 */
export interface Entrega {
  id_entrega: number;
  codigo_rastreio: string;
  id_pedido: number;
  id_cliente: number | null;
  nome_destinatario: string;
  transportadora: string | null;
  endereco_destino: EnderecoDestino;
  data_prevista: string | null;
  valor_frete: number | null;
  status_entrega: StatusEntrega;
  data_entrega: string | null;
  origem: OrigemEntrega;
  pendencias: string[];
  data_criacao: string;
  data_atualizacao: string;
}

export interface EntregaRow {
  id_entrega: number;
  codigo_rastreio: string;
  id_pedido: number;
  id_cliente: number | null;
  nome_destinatario: string;
  transportadora: string | null;
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string;
  data_prevista: string | null;
  valor_frete: string | null;
  status_entrega: StatusEntrega;
  data_entrega: string | null;
  origem: OrigemEntrega;
  data_criacao: Date;
  data_atualizacao: Date;
}

/** Dados que o pedido do G5 fornece para criar ou atualizar a entrega. */
export interface DadosPedidoImportado {
  codigo_pedido: number;
  codigo_cliente: number;
  nome_destinatario: string;
  logradouro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export type ResultadoCancelamento = 'CANCELADA' | 'JA_CANCELADA' | 'EM_ANDAMENTO' | 'SEM_ENTREGA';
export type ResultadoAtualizacao = 'ATUALIZADA' | 'NAO_EDITAVEL' | 'SEM_ENTREGA';

export interface HistoricoItem {
  status_entrega: StatusEntrega;
  data_hora: string;
  observacao: string | null;
}

export interface FiltrosListagem {
  id_pedido?: number;
  status_entrega?: StatusEntrega;
  pagina: number;
  tamanho: number;
}

export interface Pagina<T> {
  dados: T[];
  paginacao: { pagina: number; tamanho: number; total_registros: number; total_paginas: number };
}
