import { Router } from 'express';
import { pool } from '../../shared/database/pool';
import { erros } from '../../shared/http/errors';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    req.log.error({ err }, 'health check: banco indisponível');
    throw erros.servicoIndisponivel();
  }
  res.status(200).json({ status: 'UP' });
});
