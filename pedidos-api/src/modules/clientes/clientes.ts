import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { pool, withTransaction, type Queryable } from '../../shared/database/pool';
import { corpoJson } from '../../shared/http/corpo-json';
import { erros, type DetalheErro } from '../../shared/http/errors';
import {
  lancarSeHouver400,
  lerPaginacao,
  pagina,
  parseIdRota,
  validarEstrutura,
} from '../../shared/http/parametros';

/* ---------- tipos e schemas ---------- */

export interface Cliente {
  codigo_cliente: number;
  nome: string;
  ativo: boolean;
}

interface ClienteRow {
  cliente_id: number;
  nome: string;
  ativo: boolean;
}

const criarSchema = z.object({ nome: z.string() });
const atualizarSchema = z.object({ nome: z.string(), ativo: z.boolean() });

const paraCliente = (r: ClienteRow): Cliente => ({ codigo_cliente: r.cliente_id, nome: r.nome, ativo: r.ativo });

function validarNome(nome: string): DetalheErro[] {
  if (nome.trim().length === 0) return [{ campo: 'nome', problema: 'não pode conter apenas espaços' }];
  if (nome.length > 100) return [{ campo: 'nome', problema: 'deve ter no máximo 100 caracteres' }];
  return [];
}

function lancar422(detalhes: DetalheErro[]): void {
  if (detalhes.length > 0) throw erros.validacaoSemantica(detalhes);
}

/* ---------- repositório ---------- */

async function buscar(db: Queryable, id: number, bloquear = false): Promise<Cliente | null> {
  const { rows } = await db.query<ClienteRow>(
    `SELECT cliente_id, nome, ativo FROM cliente WHERE cliente_id = $1 ${bloquear ? 'FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ? paraCliente(rows[0]) : null;
}

/** API pública do módulo: usada pelo módulo de pedidos para validar o cliente. */
export async function clienteAtivoExiste(db: Queryable, id: number): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM cliente WHERE cliente_id = $1 AND ativo', [id]);
  return (rowCount ?? 0) > 0;
}

/* ---------- serviço ---------- */

const naoEncontrado = (id: number) => erros.naoEncontrado(`Cliente ${id} não encontrado.`);

async function listar(filtroAtivo: boolean | undefined, paginaAtual: number, tamanho: number) {
  const params: unknown[] = [];
  let where = '';
  if (filtroAtivo !== undefined) {
    params.push(filtroAtivo);
    where = 'WHERE ativo = $1';
  }
  const total = await pool.query<{ total: string }>(`SELECT count(*) AS total FROM cliente ${where}`, params);
  const { rows } = await pool.query<ClienteRow>(
    `SELECT cliente_id, nome, ativo FROM cliente ${where} ORDER BY cliente_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, tamanho, (paginaAtual - 1) * tamanho],
  );
  return pagina(rows.map(paraCliente), Number(total.rows[0]!.total), paginaAtual, tamanho);
}

async function criar(dados: z.infer<typeof criarSchema>): Promise<Cliente> {
  lancar422(validarNome(dados.nome));
  const { rows } = await pool.query<ClienteRow>(
    'INSERT INTO cliente (nome) VALUES ($1) RETURNING cliente_id, nome, ativo',
    [dados.nome],
  );
  return paraCliente(rows[0]!);
}

async function atualizar(id: number, dados: z.infer<typeof atualizarSchema>): Promise<Cliente> {
  return withTransaction(async (db) => {
    if (!(await buscar(db, id, true))) throw naoEncontrado(id);
    lancar422(validarNome(dados.nome));
    if (!dados.ativo) await exigirSemPedidosAtivos(db, id);
    const { rows } = await db.query<ClienteRow>(
      'UPDATE cliente SET nome = $2, ativo = $3 WHERE cliente_id = $1 RETURNING cliente_id, nome, ativo',
      [id, dados.nome, dados.ativo],
    );
    return paraCliente(rows[0]!);
  });
}

async function exigirSemPedidosAtivos(db: Queryable, id: number): Promise<void> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM pedido WHERE cliente_id = $1 AND status IN ('ABERTO', 'CONFIRMADO')`,
    [id],
  );
  if ((rowCount ?? 0) > 0) {
    throw erros.operacaoNaoPermitida('O cliente tem pedidos ABERTO ou CONFIRMADO e não pode ser desativado.');
  }
}

/** O produtor não apaga fisicamente: DELETE desativa o cliente (ativo = FALSE). */
async function desativar(id: number): Promise<void> {
  await withTransaction(async (db) => {
    if (!(await buscar(db, id, true))) throw naoEncontrado(id);
    await exigirSemPedidosAtivos(db, id);
    await db.query('UPDATE cliente SET ativo = FALSE WHERE cliente_id = $1', [id]);
  });
}

/* ---------- rotas ---------- */

export const clientesRouter = Router();
clientesRouter.use(corpoJson);

const listarHandler: RequestHandler = async (req, res) => {
  const detalhes: DetalheErro[] = [];
  const { pagina: p, tamanho } = lerPaginacao(detalhes, req.query);
  let ativo: boolean | undefined;
  if (req.query.ativo !== undefined) {
    if (req.query.ativo === 'true') ativo = true;
    else if (req.query.ativo === 'false') ativo = false;
    else detalhes.push({ campo: 'ativo', problema: 'deve ser true ou false' });
  }
  lancarSeHouver400(detalhes);
  res.status(200).json(await listar(ativo, p, tamanho));
};

clientesRouter.get('/', listarHandler);
clientesRouter.post('/', async (req, res) => {
  const cliente = await criar(validarEstrutura(criarSchema, req.body));
  res.status(201).location(`/api/v1/clientes/${cliente.codigo_cliente}`).json(cliente);
});
clientesRouter.get('/:codigo_cliente', async (req, res) => {
  const id = parseIdRota(req.params.codigo_cliente, 'codigo_cliente');
  const cliente = await buscar(pool, id);
  if (!cliente) throw naoEncontrado(id);
  res.status(200).json(cliente);
});
clientesRouter.put('/:codigo_cliente', async (req, res) => {
  const id = parseIdRota(req.params.codigo_cliente, 'codigo_cliente');
  res.status(200).json(await atualizar(id, validarEstrutura(atualizarSchema, req.body)));
});
clientesRouter.delete('/:codigo_cliente', async (req, res) => {
  await desativar(parseIdRota(req.params.codigo_cliente, 'codigo_cliente'));
  res.status(204).end();
});
