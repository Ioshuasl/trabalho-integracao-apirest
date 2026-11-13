import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../../config/env';
import { logger } from '../logger';

// DATE chega como string 'AAAA-MM-DD', sem conversão para Date (evita deslocamento de fuso).
types.setTypeParser(types.builtins.DATE, (valor) => valor);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 3000,
});

pool.on('error', (err) => logger.error({ err }, 'erro em conexão ociosa do pool'));

/** Tanto o Pool quanto um client de transação satisfazem esta interface. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(texto: string, valores?: unknown[]): Promise<QueryResult<R>>;
}

export async function withTransaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const CODIGOS_INDISPONIVEL = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
]);

/** Banco fora do ar ou inalcançável: vira 503 em vez de 500. */
export function isDbIndisponivel(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; errors?: unknown[] };
  if (e.code && CODIGOS_INDISPONIVEL.has(e.code)) return true;
  if (Array.isArray(e.errors) && e.errors.some(isDbIndisponivel)) return true; // AggregateError (IPv4 + IPv6)
  return /timeout exceeded when trying to connect|Connection terminated|the database system is (starting up|shutting down)/i.test(
    e.message ?? '',
  );
}

export function isViolacaoUnicidade(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}
