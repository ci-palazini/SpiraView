import { Router } from 'express';
import { refugosRouter } from './refugos';
import { uploadRouter } from './upload';
import { settingsRouter } from './settings';
import { analyticsRouter } from './analytics';
import { compareRouter } from './compare';
import { individualRouter } from './individual';
import { retrabalhoRouter } from './retrabalho';
import { retrabalhoSettingsRouter } from './retrabalho-settings';
import { dashboardGeralRouter } from './dashboard-geral';

export const qualidadeRouter: Router = Router();

qualidadeRouter.use(refugosRouter);
qualidadeRouter.use(uploadRouter);
qualidadeRouter.use(settingsRouter);
qualidadeRouter.use(analyticsRouter);
qualidadeRouter.use(compareRouter);
qualidadeRouter.use(individualRouter);
qualidadeRouter.use(retrabalhoRouter);
qualidadeRouter.use(retrabalhoSettingsRouter);
qualidadeRouter.use(dashboardGeralRouter);

