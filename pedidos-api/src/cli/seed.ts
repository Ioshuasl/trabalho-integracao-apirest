import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../shared/database/pool';
import { logger } from '../shared/logger';

/**
 * Recarrega os dados de teste (clientes 1-7, pedidos 101-108). Apaga os dados atuais.
 * Com `--se-vazio` só carrega se ainda não houver nenhum pedido (uso no primeiro deploy).
 */
async function recarregar(): Promise<boolean> {
  if (process.argv.includes('--se-vazio')) {
    const { rows } = await pool.query<{ total: string }>('SELECT count(*) AS total FROM pedido');
    if (Number(rows[0]!.total) > 0) return false;
  }

  const sql = await readFile(path.resolve(__dirname, '../../seeds/dados_teste.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return true;
}

recarregar()
  .then((carregou) =>
    logger.info(carregou ? 'dados de teste carregados: clientes 1-7, pedidos 101-108' : 'banco já tem pedidos: seed ignorado'),
  )
  .catch((err) => {
    logger.error({ err }, 'falha ao carregar dados de teste');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
