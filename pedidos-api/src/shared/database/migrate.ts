import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

export const DIRETORIO_MIGRATIONS = path.resolve(__dirname, '../../../migrations');

/** Aplica, em ordem alfabética, os arquivos .sql ainda não registrados em schema_migrations. */
export async function executarMigracoes(pool: Pool, diretorio = DIRETORIO_MIGRATIONS): Promise<string[]> {
  const client = await pool.connect();
  const aplicadas: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(7005)'); // evita execuções concorrentes
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         nome TEXT PRIMARY KEY,
         aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ nome: string }>('SELECT nome FROM schema_migrations');
    const jaAplicadas = new Set(rows.map((r) => r.nome));

    const arquivos = (await readdir(diretorio)).filter((f) => f.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) continue;
      const sql = await readFile(path.join(diretorio, arquivo), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migration ${arquivo}: ${(err as Error).message}`);
      }
      aplicadas.push(arquivo);
    }
    return aplicadas;
  } finally {
    await client.query('SELECT pg_advisory_unlock(7005)').catch(() => undefined);
    client.release();
  }
}
