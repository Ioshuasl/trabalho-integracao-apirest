export const CHAVE_ADMIN = 'chave-admin-teste';
export const CHAVE_G7 = 'chave-g7-teste';

export const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://pedidos:pedidos@localhost:5435/pedidos_test',
  API_KEY_ADMIN: CHAVE_ADMIN,
  API_KEY_G7: CHAVE_G7,
};
