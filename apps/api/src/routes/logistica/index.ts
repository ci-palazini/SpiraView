import { Router } from 'express';
import { kpisRouter } from './kpis';

export const logisticaRouter: Router = Router();

logisticaRouter.use(kpisRouter);

// Sub-routers serão adicionados aqui conforme as páginas forem criadas
// Exemplo:
// import { dashboardRouter } from './dashboard';
// logisticaRouter.use(dashboardRouter);
