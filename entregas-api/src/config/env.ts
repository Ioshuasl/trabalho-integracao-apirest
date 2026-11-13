import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5007),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  API_KEY_WRITE: z.string().min(8),
  API_KEY_READ: z.string().min(8),

  // API de Pedidos (Grupo 5), da qual somos consumidores
  G5_BASE_URL: z.string().url().default('http://localhost:5005/api/v1'),
  G5_API_KEY: z.string().min(1),
  G5_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  G5_RETRY_DELAYS_MS: z
    .string()
    .default('1000,2000,4000')
    .transform((valor) => valor.split(',').map((parte) => Number(parte.trim())))
    .pipe(z.array(z.number().int().nonnegative())),
});

const resultado = schema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Variáveis de ambiente inválidas:\n${problemas}`);
  process.exit(1);
}

export const env = resultado.data;
