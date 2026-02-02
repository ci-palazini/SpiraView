import { Router } from 'express';
import { refugosRouter } from './refugos';
import { uploadRouter } from './upload';
import { settingsRouter } from './settings';
import { analyticsRouter } from './analytics';

export const qualidadeRouter: Router = Router();

qualidadeRouter.use(refugosRouter);
qualidadeRouter.use(uploadRouter);
qualidadeRouter.use(settingsRouter);
qualidadeRouter.use(analyticsRouter);

