import { Router } from 'express';
import { kpisRouter } from './kpis';
import { painelRouter } from './painel';
import { princ1Router } from './princ1';
import { propostoRouter } from './proposto';

export const logisticaRouter: Router = Router();

logisticaRouter.use(kpisRouter);
logisticaRouter.use(painelRouter);
logisticaRouter.use(princ1Router);
logisticaRouter.use(propostoRouter);
