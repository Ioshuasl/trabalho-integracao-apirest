export const STATUS = [
  'AGUARDANDO_COLETA',
  'EM_TRANSITO',
  'SAIU_PARA_ENTREGA',
  'ENTREGUE',
  'NAO_ENTREGUE',
  'DEVOLVIDA',
  'CANCELADA',
] as const;

export type StatusEntrega = (typeof STATUS)[number];

export function isStatus(valor: string): valor is StatusEntrega {
  return (STATUS as readonly string[]).includes(valor);
}

/** Transições permitidas (contrato, seção 2.2). Status finais não têm saída. */
export const TRANSICOES: Record<StatusEntrega, readonly StatusEntrega[]> = {
  AGUARDANDO_COLETA: ['EM_TRANSITO', 'CANCELADA'],
  EM_TRANSITO: ['SAIU_PARA_ENTREGA', 'CANCELADA'],
  SAIU_PARA_ENTREGA: ['ENTREGUE', 'NAO_ENTREGUE'],
  NAO_ENTREGUE: ['SAIU_PARA_ENTREGA', 'DEVOLVIDA'],
  ENTREGUE: [],
  DEVOLVIDA: [],
  CANCELADA: [],
};

export const STATUS_FINAIS: readonly StatusEntrega[] = ['ENTREGUE', 'DEVOLVIDA', 'CANCELADA'];

/** O PUT só é permitido nestes status. */
export const STATUS_EDITAVEIS: readonly StatusEntrega[] = ['AGUARDANDO_COLETA', 'EM_TRANSITO'];
