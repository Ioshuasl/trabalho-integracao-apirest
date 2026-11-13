import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5005),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  API_KEY_ADMIN: z.string().min(8),
  API_KEY_G7: z.string().min(8),
});

const resultado = schema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Variáveis de ambiente inválidas:\n${problemas}`);
  process.exit(1);
}

export const env = resultado.data;
