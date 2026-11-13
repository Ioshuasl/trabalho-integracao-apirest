export const STATUS_PEDIDO = ['ABERTO', 'CONFIRMADO', 'CANCELADO'] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export function isStatusPedido(valor: string): valor is StatusPedido {
  return (STATUS_PEDIDO as readonly string[]).includes(valor);
}

/** ABERTO ainda está sendo montado; CONFIRMADO só pode ser cancelado; CANCELADO é final. */
export const TRANSICOES: Record<StatusPedido, readonly StatusPedido[]> = {
  ABERTO: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['CANCELADO'],
  CANCELADO: [],
};
