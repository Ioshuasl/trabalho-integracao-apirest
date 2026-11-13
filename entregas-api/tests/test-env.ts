export const CHAVE_ESCRITA = 'chave-escrita-teste';
export const CHAVE_LEITURA = 'chave-leitura-teste';

export const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://entregas:entregas@localhost:5432/entregas_test',
  API_KEY_WRITE: CHAVE_ESCRITA,
  API_KEY_READ: CHAVE_LEITURA,
  G5_BASE_URL: 'http://127.0.0.1:1/api/v1',
  G5_API_KEY: 'g7-entregas-leitura-2026',
  G5_TIMEOUT_MS: '300',
  G5_RETRY_DELAYS_MS: '5,5,5',
};
