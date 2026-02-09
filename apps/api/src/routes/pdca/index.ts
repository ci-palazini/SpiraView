import { Router } from 'express';
import { planosRouter } from './planos';
import { causasRouter } from './causas';
import { dashboardRouter } from './dashboard';

export const pdcaRouter: Router = Router();

pdcaRouter.use(planosRouter);
pdcaRouter.use(causasRouter);
pdcaRouter.use(dashboardRouter);
