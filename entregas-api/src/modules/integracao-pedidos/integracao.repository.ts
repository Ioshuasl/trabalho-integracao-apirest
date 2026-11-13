import type { Queryable } from '../../shared/database/pool';
import { formatarDataHora } from '../../shared/datetime';
import type { RegistroIntegracao } from './g5.client';
import type { PedidoG5 } from './g5.schemas';

export async function registrarLog(db: Queryable, r: RegistroIntegracao): Promise<void> {
  await db.query(
    `INSERT INTO integracao_logs
       (importacao_id, request_id, sistema, metodo, endpoint, status_http, tipo_ocorrencia, erro_codigo,
        descricao, acao_tomada, tentativa, duracao_ms)
     VALUES ($1, $2, 'G5', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      r.importacaoId, r.requestId, r.metodo, r.endpoint, r.statusHttp, r.tipo, r.erroCodigo,
      r.descricao, r.acaoTomada, r.tentativa, r.duracaoMs,
    ],
  );
}

interface LogRow {
  data_hora: Date;
  importacao_id: string | null;
  request_id: string | null;
  metodo: string;
  endpoint: string;
  status_http: number | null;
  tipo_ocorrencia: string;
  erro_codigo: string | null;
  descricao: string;
  acao_tomada: string;
  tentativa: number;
  duracao_ms: number | null;
}

export async function listarLogs(db: Queryable, limite: number, importacaoId?: string) {
  const { rows } = await db.query<LogRow>(
    `SELECT data_hora, importacao_id, request_id, metodo, endpoint, status_http, tipo_ocorrencia,
            erro_codigo, descricao, acao_tomada, tentativa, duracao_ms
       FROM integracao_logs
      WHERE sistema = 'G5' AND ($1::uuid IS NULL OR importacao_id = $1::uuid)
      ORDER BY id_log DESC
      LIMIT $2`,
    [importacaoId ?? null, limite],
  );
  return rows.map((r) => ({
    data_hora: formatarDataHora(r.data_hora),
    importacao_id: r.importacao_id,
    request_id: r.request_id,
    metodo: r.metodo,
    endpoint: r.endpoint,
    status_http: r.status_http,
    tipo_ocorrencia: r.tipo_ocorrencia,
    erro_codigo: r.erro_codigo,
    descricao: r.descricao,
    acao_tomada: r.acao_tomada,
    tentativa: r.tentativa,
    duracao_ms: r.duracao_ms,
  }));
}

export interface PedidoImportado {
  codigo_pedido: number;
  status_pedido: 'CONFIRMADO' | 'CANCELADO';
  origem_atualizado_em: Date;
}

/** Última leitura do pedido, travada para a transação (duas importações simultâneas não se atropelam). */
export async function buscarImportado(db: Queryable, codigoPedido: number): Promise<PedidoImportado | null> {
  const { rows } = await db.query<PedidoImportado>(
    `SELECT codigo_pedido, status_pedido, origem_atualizado_em
       FROM pedidos_importados WHERE codigo_pedido = $1 FOR UPDATE`,
    [codigoPedido],
  );
  return rows[0] ?? null;
}

/** Insere o pedido; retorna false se outra importação o inseriu antes (chave primária). */
export async function inserirImportado(db: Queryable, p: PedidoG5, importacaoId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO pedidos_importados
       (codigo_pedido, codigo_cliente, nome_cliente, endereco_entrega, cidade_entrega, uf_entrega, cep_entrega,
        data_pedido, quantidade_itens, valor_total, status_pedido, origem_atualizado_em, ultima_importacao_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (codigo_pedido) DO NOTHING`,
    [
      p.codigo_pedido, p.codigo_cliente, p.nome_cliente, p.endereco_entrega, p.cidade_entrega, p.uf_entrega,
      p.cep_entrega, p.data_pedido, p.quantidade_itens, p.valor_total, p.status_pedido, p.data_atualizacao, importacaoId,
    ],
  );
  return (rowCount ?? 0) > 0;
}

export async function atualizarImportado(db: Queryable, p: PedidoG5, importacaoId: string): Promise<void> {
  await db.query(
    `UPDATE pedidos_importados SET
       codigo_cliente = $2, nome_cliente = $3, endereco_entrega = $4, cidade_entrega = $5, uf_entrega = $6,
       cep_entrega = $7, data_pedido = $8, quantidade_itens = $9, valor_total = $10, status_pedido = $11,
       origem_atualizado_em = $12, ultima_importacao_id = $13, atualizado_em = now()
     WHERE codigo_pedido = $1`,
    [
      p.codigo_pedido, p.codigo_cliente, p.nome_cliente, p.endereco_entrega, p.cidade_entrega, p.uf_entrega,
      p.cep_entrega, p.data_pedido, p.quantidade_itens, p.valor_total, p.status_pedido, p.data_atualizacao, importacaoId,
    ],
  );
}

export async function vincularEntrega(db: Queryable, codigoPedido: number, idEntrega: number): Promise<void> {
  await db.query('UPDATE pedidos_importados SET id_entrega = $2 WHERE codigo_pedido = $1', [codigoPedido, idEntrega]);
}

export async function listarImportados(db: Queryable, limite: number) {
  const { rows } = await db.query(
    `SELECT codigo_pedido, codigo_cliente, nome_cliente, endereco_entrega, cidade_entrega, uf_entrega,
            cep_entrega, data_pedido, quantidade_itens, valor_total, status_pedido, origem_atualizado_em,
            id_entrega, ultima_importacao_id, importado_em, atualizado_em
       FROM pedidos_importados
      ORDER BY codigo_pedido DESC
      LIMIT $1`,
    [limite],
  );
  return rows.map((r) => ({
    codigo_pedido: r.codigo_pedido as number,
    codigo_cliente: r.codigo_cliente as number,
    nome_cliente: r.nome_cliente as string,
    endereco_entrega: r.endereco_entrega as string,
    cidade_entrega: r.cidade_entrega as string,
    uf_entrega: r.uf_entrega as string,
    cep_entrega: r.cep_entrega as string,
    data_pedido: formatarDataHora(r.data_pedido as Date),
    quantidade_itens: r.quantidade_itens as number,
    valor_total: Number(r.valor_total),
    status_pedido: r.status_pedido as string,
    origem_atualizado_em: (r.origem_atualizado_em as Date).toISOString(),
    id_entrega: r.id_entrega as number | null,
    ultima_importacao_id: r.ultima_importacao_id as string,
    importado_em: formatarDataHora(r.importado_em as Date),
    atualizado_em: formatarDataHora(r.atualizado_em as Date),
  }));
}
