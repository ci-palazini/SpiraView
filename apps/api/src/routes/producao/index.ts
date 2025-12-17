// apps/api/src/routes/producao/index.ts
import { Router } from 'express';
import { metasRouter } from './metas';
import { lancamentosRouter } from './lancamentos';
import { uploadRouter } from './upload';

export const producaoRouter: Router = Router();

// Agregador: Monta todas as rotas de produção
producaoRouter.use(metasRouter);
producaoRouter.use(lancamentosRouter);
producaoRouter.use(uploadRouter);

