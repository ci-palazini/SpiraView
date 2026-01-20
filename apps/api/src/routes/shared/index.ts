// apps/api/src/routes/shared/index.ts
import { Router } from 'express';
import { maquinasRouter } from './maquinas';

export const sharedRouter: Router = Router();

// Agregador: Monta rotas compartilhadas entre departamentos
sharedRouter.use(maquinasRouter);

// Re-export individual routers for direct access if needed
export { maquinasRouter } from './maquinas';
