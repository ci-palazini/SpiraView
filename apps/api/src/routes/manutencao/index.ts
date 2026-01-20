// apps/api/src/routes/manutencao/index.ts
import { Router } from 'express';
import { agendamentosRouter } from './agendamentos';
import { analyticsRouter } from './analytics';
import { botRouter } from './bot';
import { causasRouter } from './causas';
import { chamadosRouter } from './chamados';
import { checklistsRouter } from './checklists';
import { pecasRouter } from './pecas';

export const manutencaoRouter: Router = Router();

// Agregador: Monta todas as rotas de manutenção
manutencaoRouter.use(agendamentosRouter);
manutencaoRouter.use(analyticsRouter);
manutencaoRouter.use(botRouter);
manutencaoRouter.use(causasRouter);
manutencaoRouter.use(chamadosRouter);
manutencaoRouter.use(checklistsRouter);
manutencaoRouter.use(pecasRouter);

// Re-export individual routers for direct access if needed
export { agendamentosRouter } from './agendamentos';
export { analyticsRouter } from './analytics';
export { botRouter } from './bot';
export { causasRouter } from './causas';
export { chamadosRouter } from './chamados';
export { checklistsRouter } from './checklists';
export { pecasRouter } from './pecas';
