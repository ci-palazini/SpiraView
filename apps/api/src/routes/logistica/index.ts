import { Router } from 'express';
import { kpisRouter } from './kpis';
import { painelRouter } from './painel';
import { princ1Router } from './princ1';

export const logisticaRouter: Router = Router();

logisticaRouter.use(kpisRouter);
logisticaRouter.use(painelRouter);
logisticaRouter.use(princ1Router);
