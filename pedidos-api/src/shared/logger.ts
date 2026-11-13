import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { servico: 'api-pedidos' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
