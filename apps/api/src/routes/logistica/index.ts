import { Router } from 'express';
import { kpisRouter } from './kpis';
import { painelRouter } from './painel';

export const logisticaRouter: Router = Router();

logisticaRouter.use(kpisRouter);
logisticaRouter.use(painelRouter);
