// apps/api/src/routes/manutencao/index.ts
import { Router } from 'express';
import { agendamentosRouter } from './agendamentos';
import { analyticsRouter } from './analytics';

import { causasRouter } from './causas';
import { chamadosRouter } from './chamados';
import { checklistsRouter } from './checklists';
import { pecasRouter } from './pecas';

export const manutencaoRouter: Router = Router();

// Agregador: Monta todas as rotas de manutenção
manutencaoRouter.use(agendamentosRouter);
manutencaoRouter.use(analyticsRouter);

manutencaoRouter.use(causasRouter);
manutencaoRouter.use(chamadosRouter);
manutencaoRouter.use(checklistsRouter);
manutencaoRouter.use(pecasRouter);
