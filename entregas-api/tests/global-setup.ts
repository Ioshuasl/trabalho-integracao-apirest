import { Client, Pool } from 'pg';
import { executarMigracoes } from '../src/shared/database/migrate';
import { testEnv } from './test-env';

/** Cria o banco entregas_test (se preciso) e aplica as migrations antes de toda a suíte. */
export default async function setup(): Promise<void> {
  const url = new URL(testEnv.DATABASE_URL);
  const nomeBanco = url.pathname.slice(1);

  const adminUrl = new URL(testEnv.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nomeBanco]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${nomeBanco}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: testEnv.DATABASE_URL });
  try {
    await executarMigracoes(pool);
  } finally {
    await pool.end();
  }
}
