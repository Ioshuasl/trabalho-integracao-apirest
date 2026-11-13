import { z } from 'zod';

/*
 * Schemas ESTRUTURAIS: só verificam presença e tipo JSON (falha => 400).
 * Formato, tamanho, faixa e regras de negócio ficam em pedidos.validation.ts (falha => 422).
 */

const itemSchema = z.object({
  descricao: z.string(),
  quantidade: z.number().int(),
  preco_unitario: z.number(),
});

const enderecoShape = {
  endereco_entrega: z.string(),
  cidade_entrega: z.string(),
  uf_entrega: z.string(),
  cep_entrega: z.string(),
};

export const criarPedidoSchema = z.object({
  codigo_cliente: z.number().int(),
  ...enderecoShape,
  itens: z.array(itemSchema),
});

/** PUT: endereço obrigatório; itens opcionais (se enviados, substituem todos). */
export const atualizarPedidoSchema = z.object({
  ...enderecoShape,
  codigo_cliente: z.number().int().optional(),
  itens: z.array(itemSchema).optional(),
});

export const alterarStatusSchema = z.object({ status_pedido: z.string() });

export type ItemInput = z.infer<typeof itemSchema>;
export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>;
export type AtualizarPedidoInput = z.infer<typeof atualizarPedidoSchema>;
export type AlterarStatusInput = z.infer<typeof alterarStatusSchema>;
export type EnderecoInput = Pick<CriarPedidoInput, 'endereco_entrega' | 'cidade_entrega' | 'uf_entrega' | 'cep_entrega'>;
