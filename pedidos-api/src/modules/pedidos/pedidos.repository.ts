import type { Queryable } from '../../shared/database/pool';
import { formatarDataHoraMs } from '../../shared/datetime';
import type { EnderecoInput, ItemInput } from './pedidos.schemas';
import type { FiltrosPedidos, ItemPedido, PedidoResumo, PedidoResumoRow } from './pedidos.types';
import type { StatusPedido } from './status';

export function paraResumo(r: PedidoResumoRow): PedidoResumo {
  return {
    codigo_pedido: r.codigo_pedido,
    codigo_cliente: r.codigo_cliente,
    nome_cliente: r.nome_cliente,
    endereco_entrega: r.endereco_entrega,
    cidade_entrega: r.cidade_entrega,
    uf_entrega: r.uf_entrega,
    cep_entrega: r.cep_entrega,
    data_pedido: formatarDataHoraMs(r.data_pedido),
    quantidade_itens: r.quantidade_itens,
    valor_total: Number(r.valor_total),
    status_pedido: r.status_pedido,
    data_atualizacao: formatarDataHoraMs(r.data_atualizacao),
  };
}

const SELECT_RESUMO = `
  SELECT pe.pedido_id AS codigo_pedido, pe.cliente_id AS codigo_cliente, cl.nome AS nome_cliente,
         pe.endereco_entrega, pe.cidade_entrega, pe.uf_entrega, pe.cep_entrega, pe.data_pedido,
         COALESCE(SUM(ip.quantidade), 0)::integer AS quantidade_itens, pe.valor_total,
         pe.status AS status_pedido, pe.data_atualizacao
    FROM pedido pe
    JOIN cliente cl          ON cl.cliente_id = pe.cliente_id
    LEFT JOIN item_pedido ip ON ip.pedido_id  = pe.pedido_id`;

const GROUP_RESUMO = 'GROUP BY pe.pedido_id, cl.cliente_id, cl.nome';

export async function listar(db: Queryable, f: FiltrosPedidos): Promise<{ pedidos: PedidoResumo[]; total: number }> {
  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (f.status_pedido !== undefined) {
    params.push(f.status_pedido);
    condicoes.push(`pe.status = $${params.length}`);
  }
  if (f.codigo_cliente !== undefined) {
    params.push(f.codigo_cliente);
    condicoes.push(`pe.cliente_id = $${params.length}`);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const total = await db.query<{ total: string }>(`SELECT count(*) AS total FROM pedido pe ${where}`, params);
  const { rows } = await db.query<PedidoResumoRow>(
    `${SELECT_RESUMO} ${where} ${GROUP_RESUMO} ORDER BY pe.pedido_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.tamanho, (f.pagina - 1) * f.tamanho],
  );
  return { pedidos: rows.map(paraResumo), total: Number(total.rows[0]!.total) };
}

export async function buscarResumo(db: Queryable, id: number): Promise<PedidoResumo | null> {
  const { rows } = await db.query<PedidoResumoRow>(`${SELECT_RESUMO} WHERE pe.pedido_id = $1 ${GROUP_RESUMO}`, [id]);
  return rows[0] ? paraResumo(rows[0]) : null;
}

export async function listarItens(db: Queryable, id: number): Promise<ItemPedido[]> {
  const { rows } = await db.query<{ id_item: number; descricao: string; quantidade: number; preco_unitario: string }>(
    `SELECT item_pedido_id AS id_item, descricao, quantidade, preco_unitario
       FROM item_pedido WHERE pedido_id = $1 ORDER BY item_pedido_id`,
    [id],
  );
  return rows.map((r) => ({ ...r, preco_unitario: Number(r.preco_unitario) }));
}

/** Trava a linha do pedido durante a transação (o resumo usa GROUP BY, que não aceita FOR UPDATE). */
export async function bloquear(db: Queryable, id: number): Promise<{ status: StatusPedido; cliente_id: number } | null> {
  const { rows } = await db.query<{ status: StatusPedido; cliente_id: number }>(
    'SELECT status, cliente_id FROM pedido WHERE pedido_id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

export async function inserir(
  db: Queryable,
  clienteId: number,
  e: EnderecoInput,
  valorTotal: number,
): Promise<number> {
  const { rows } = await db.query<{ pedido_id: number }>(
    `INSERT INTO pedido (cliente_id, endereco_entrega, cidade_entrega, uf_entrega, cep_entrega, valor_total)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING pedido_id`,
    [clienteId, e.endereco_entrega, e.cidade_entrega, e.uf_entrega, e.cep_entrega, valorTotal],
  );
  return rows[0]!.pedido_id;
}

export async function inserirItens(db: Queryable, id: number, itens: ItemInput[]): Promise<void> {
  for (const item of itens) {
    await db.query(
      'INSERT INTO item_pedido (pedido_id, descricao, quantidade, preco_unitario) VALUES ($1, $2, $3, $4)',
      [id, item.descricao, item.quantidade, item.preco_unitario],
    );
  }
}

export async function substituirItens(db: Queryable, id: number, itens: ItemInput[]): Promise<void> {
  await db.query('DELETE FROM item_pedido WHERE pedido_id = $1', [id]);
  await inserirItens(db, id, itens);
}

/** A trigger do banco renova data_atualizacao a cada UPDATE (Contrato B). */
export async function atualizarEndereco(
  db: Queryable,
  id: number,
  e: EnderecoInput,
  valorTotal: number | null,
): Promise<void> {
  await db.query(
    `UPDATE pedido SET endereco_entrega = $2, cidade_entrega = $3, uf_entrega = $4, cep_entrega = $5,
                       valor_total = COALESCE($6, valor_total)
      WHERE pedido_id = $1`,
    [id, e.endereco_entrega, e.cidade_entrega, e.uf_entrega, e.cep_entrega, valorTotal],
  );
}

export async function atualizarStatus(db: Queryable, id: number, status: StatusPedido): Promise<void> {
  await db.query('UPDATE pedido SET status = $2 WHERE pedido_id = $1', [id, status]);
}

export async function excluir(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM pedido WHERE pedido_id = $1', [id]);
}

/** Estrutura de integração (Contrato B): view somente com CONFIRMADO e CANCELADO, sem itens. */
export async function listarIntegracao(
  db: Queryable,
  pagina: number,
  tamanho: number,
): Promise<{ pedidos: PedidoResumo[]; total: number }> {
  const total = await db.query<{ total: string }>('SELECT count(*) AS total FROM integracao.vw_integracao_pedidos');
  const { rows } = await db.query<PedidoResumoRow>(
    'SELECT * FROM integracao.vw_integracao_pedidos ORDER BY codigo_pedido LIMIT $1 OFFSET $2',
    [tamanho, (pagina - 1) * tamanho],
  );
  return { pedidos: rows.map(paraResumo), total: Number(total.rows[0]!.total) };
}
