import { Router } from 'express';
import { refugosRouter } from './refugos';
import { uploadRouter } from './upload';
import { settingsRouter } from './settings';
import { analyticsRouter } from './analytics';
import { compareRouter } from './compare';

export const qualidadeRouter: Router = Router();

qualidadeRouter.use(refugosRouter);
qualidadeRouter.use(uploadRouter);
qualidadeRouter.use(settingsRouter);
qualidadeRouter.use(analyticsRouter);
qualidadeRouter.use(compareRouter);

