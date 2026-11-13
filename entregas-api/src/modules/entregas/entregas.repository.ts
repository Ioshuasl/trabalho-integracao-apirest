import type { Queryable } from '../../shared/database/pool';
import { formatarDataHora, formatarDataHoraMs } from '../../shared/datetime';
import type { DadosEditaveisInput } from './entregas.schemas';
import type { DadosPedidoImportado, Entrega, EntregaRow, FiltrosListagem, HistoricoItem } from './entregas.types';
import type { StatusEntrega } from './status';

function pendenciasDe(row: EntregaRow): string[] {
  const campos: [string, unknown][] = [
    ['id_cliente', row.id_cliente],
    ['transportadora', row.transportadora],
    ['endereco_destino.numero', row.numero],
    ['endereco_destino.bairro', row.bairro],
    ['data_prevista', row.data_prevista],
    ['valor_frete', row.valor_frete],
  ];
  return campos.filter(([, valor]) => valor === null).map(([campo]) => campo);
}

export function paraEntrega(row: EntregaRow): Entrega {
  return {
    id_entrega: row.id_entrega,
    codigo_rastreio: row.codigo_rastreio,
    id_pedido: row.id_pedido,
    id_cliente: row.id_cliente,
    nome_destinatario: row.nome_destinatario,
    transportadora: row.transportadora,
    endereco_destino: {
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento,
      bairro: row.bairro,
      cidade: row.cidade,
      uf: row.uf,
      cep: row.cep,
    },
    data_prevista: row.data_prevista,
    valor_frete: row.valor_frete === null ? null : Number(row.valor_frete),
    status_entrega: row.status_entrega,
    data_entrega: row.data_entrega,
    origem: row.origem,
    pendencias: pendenciasDe(row),
    data_criacao: formatarDataHoraMs(row.data_criacao),
    data_atualizacao: formatarDataHoraMs(row.data_atualizacao),
  };
}

export async function proximoId(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT nextval(pg_get_serial_sequence('entregas', 'id_entrega'))::int AS id`,
  );
  return rows[0]!.id;
}

export async function existeAtivaPorPedido(db: Queryable, idPedido: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM entregas WHERE id_pedido = $1 AND status_entrega <> 'CANCELADA'`,
    [idPedido],
  );
  return (rowCount ?? 0) > 0;
}

export async function inserir(
  db: Queryable,
  id: number,
  codigoRastreio: string,
  idPedido: number,
  idCliente: number,
  dados: DadosEditaveisInput,
): Promise<Entrega> {
  const e = dados.endereco_destino;
  const { rows } = await db.query<EntregaRow>(
    `INSERT INTO entregas (
       id_entrega, codigo_rastreio, id_pedido, id_cliente, nome_destinatario, transportadora,
       logradouro, numero, complemento, bairro, cidade, uf, cep, data_prevista, valor_frete
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      id, codigoRastreio, idPedido, idCliente, dados.nome_destinatario, dados.transportadora,
      e.logradouro, e.numero, e.complemento ?? null, e.bairro, e.cidade, e.uf, e.cep,
      dados.data_prevista, dados.valor_frete,
    ],
  );
  return paraEntrega(rows[0]!);
}

export async function inserirImportada(
  db: Queryable,
  id: number,
  codigoRastreio: string,
  dados: DadosPedidoImportado,
): Promise<Entrega> {
  const { rows } = await db.query<EntregaRow>(
    `INSERT INTO entregas (
       id_entrega, codigo_rastreio, id_pedido, id_cliente, nome_destinatario, logradouro, cidade, uf, cep, origem
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PEDIDOS_G5')
     RETURNING *`,
    [
      id, codigoRastreio, dados.codigo_pedido, dados.codigo_cliente, dados.nome_destinatario,
      dados.logradouro, dados.cidade, dados.uf, dados.cep,
    ],
  );
  return paraEntrega(rows[0]!);
}

/** Entrega criada pela importação do pedido do G5 (a mais recente, se houve reenvio). */
export async function buscarPorPedidoImportado(
  db: Queryable,
  codigoPedido: number,
  bloquear = false,
): Promise<Entrega | null> {
  const { rows } = await db.query<EntregaRow>(
    `SELECT * FROM entregas WHERE id_pedido = $1 AND origem = 'PEDIDOS_G5'
      ORDER BY id_entrega DESC LIMIT 1 ${bloquear ? 'FOR UPDATE' : ''}`,
    [codigoPedido],
  );
  return rows[0] ? paraEntrega(rows[0]) : null;
}

export async function atualizarDadosImportados(
  db: Queryable,
  id: number,
  dados: DadosPedidoImportado,
): Promise<void> {
  await db.query(
    `UPDATE entregas SET nome_destinatario = $2, logradouro = $3, cidade = $4, uf = $5, cep = $6,
                         data_atualizacao = now()
      WHERE id_entrega = $1`,
    [id, dados.nome_destinatario, dados.logradouro, dados.cidade, dados.uf, dados.cep],
  );
}

export async function buscarPorId(db: Queryable, id: number, bloquear = false): Promise<Entrega | null> {
  const { rows } = await db.query<EntregaRow>(
    `SELECT * FROM entregas WHERE id_entrega = $1 ${bloquear ? 'FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ? paraEntrega(rows[0]) : null;
}

export async function listar(
  db: Queryable,
  filtros: FiltrosListagem,
): Promise<{ entregas: Entrega[]; total: number }> {
  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (filtros.id_pedido !== undefined) {
    params.push(filtros.id_pedido);
    condicoes.push(`id_pedido = $${params.length}`);
  }
  if (filtros.status_entrega !== undefined) {
    params.push(filtros.status_entrega);
    condicoes.push(`status_entrega = $${params.length}`);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const contagem = await db.query<{ total: string }>(`SELECT count(*) AS total FROM entregas ${where}`, params);

  const paramsPagina = [...params, filtros.tamanho, (filtros.pagina - 1) * filtros.tamanho];
  const { rows } = await db.query<EntregaRow>(
    `SELECT * FROM entregas ${where} ORDER BY id_entrega LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    paramsPagina,
  );
  return { entregas: rows.map(paraEntrega), total: Number(contagem.rows[0]!.total) };
}

export async function atualizarCadastro(
  db: Queryable,
  id: number,
  dados: DadosEditaveisInput,
  idCliente: number | null,
): Promise<Entrega> {
  const e = dados.endereco_destino;
  const { rows } = await db.query<EntregaRow>(
    `UPDATE entregas SET
       nome_destinatario = $2, transportadora = $3, logradouro = $4, numero = $5, complemento = $6,
       bairro = $7, cidade = $8, uf = $9, cep = $10, data_prevista = $11, valor_frete = $12,
       id_cliente = $13, data_atualizacao = now()
     WHERE id_entrega = $1
     RETURNING *`,
    [
      id, dados.nome_destinatario, dados.transportadora, e.logradouro, e.numero, e.complemento ?? null,
      e.bairro, e.cidade, e.uf, e.cep, dados.data_prevista, dados.valor_frete, idCliente,
    ],
  );
  return paraEntrega(rows[0]!);
}

export async function atualizarStatus(
  db: Queryable,
  id: number,
  status: StatusEntrega,
  dataEntrega: string | null,
): Promise<Entrega> {
  const { rows } = await db.query<EntregaRow>(
    `UPDATE entregas SET status_entrega = $2, data_entrega = $3, data_atualizacao = now()
     WHERE id_entrega = $1
     RETURNING *`,
    [id, status, dataEntrega],
  );
  return paraEntrega(rows[0]!);
}

export async function excluir(db: Queryable, id: number): Promise<void> {
  await db.query('DELETE FROM entregas WHERE id_entrega = $1', [id]);
}

export async function inserirHistorico(
  db: Queryable,
  id: number,
  status: StatusEntrega,
  observacao: string | null,
): Promise<void> {
  await db.query(
    'INSERT INTO entregas_historico (id_entrega, status_entrega, observacao) VALUES ($1, $2, $3)',
    [id, status, observacao],
  );
}

export async function listarHistorico(db: Queryable, id: number): Promise<HistoricoItem[]> {
  const { rows } = await db.query<{ status_entrega: StatusEntrega; data_hora: Date; observacao: string | null }>(
    'SELECT status_entrega, data_hora, observacao FROM entregas_historico WHERE id_entrega = $1 ORDER BY id_historico',
    [id],
  );
  return rows.map((r) => ({
    status_entrega: r.status_entrega,
    data_hora: formatarDataHora(r.data_hora),
    observacao: r.observacao,
  }));
}
