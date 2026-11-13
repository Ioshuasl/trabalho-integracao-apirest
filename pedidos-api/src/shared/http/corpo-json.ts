import express, { type RequestHandler } from 'express';
import { erros } from './errors';

/** POST, PUT e PATCH exigem Content-Type: application/json. */
const exigirJson: RequestHandler = (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    throw erros.requisicaoInvalida([
      { campo: 'Content-Type', problema: 'deve ser application/json e o corpo é obrigatório' },
    ]);
  }
  next();
};

export const corpoJson: RequestHandler[] = [exigirJson, express.json({ limit: '100kb' })];
